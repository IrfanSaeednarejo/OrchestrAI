// scripts/run-crossover-clustered.ts
import pg from 'pg';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const DOMAINS: Record<string, string[]> = {
  orders: ['status', 'modification', 'cancellation', 'lookup'],
  payments: ['methods', 'disputes', 'charges', 'billing'],
  account: ['security', 'profile', 'login', 'verification'],
  refunds: ['eligibility', 'timeline', 'exceptions', 'methods'],
  shipping: ['carriers', 'tracking', 'delays', 'international'],
};

const DOMAIN_KEYS = Object.keys(DOMAINS);
const DIM = 768;

function generateClusterCentroids(k = 50): Float32Array[] {
  const centroids: Float32Array[] = [];
  for (let c = 0; c < k; c++) {
    const vec = new Float32Array(DIM);
    let sumSq = 0;
    for (let i = 0; i < DIM; i++) {
      const v = (Math.random() - 0.5) * 2;
      vec[i] = v;
      sumSq += v * v;
    }
    const norm = Math.sqrt(sumSq);
    for (let i = 0; i < DIM; i++) vec[i] /= norm;
    centroids.push(vec);
  }
  return centroids;
}

function sampleClusteredVector(centroids: Float32Array[], sigma = 0.08): string {
  const c = centroids[Math.floor(Math.random() * centroids.length)]!;
  const vec = new Float32Array(DIM);
  let sumSq = 0;
  for (let i = 0; i < DIM; i++) {
    const u1 = Math.random() || 1e-7;
    const u2 = Math.random() || 1e-7;
    const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    const v = c[i] + z * sigma;
    vec[i] = v;
    sumSq += v * v;
  }
  const norm = Math.sqrt(sumSq);
  const out = new Array<string>(DIM);
  for (let i = 0; i < DIM; i++) {
    out[i] = (vec[i] / norm).toFixed(6);
  }
  return `[${out.join(',')}]`;
}

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  const weight = idx - lower;
  return Number(((1 - weight) * sorted[lower] + weight * sorted[upper]).toFixed(3));
}

interface QueryRecord {
  domain: string;
  topic: string;
  vector: string;
}

interface ExecMetrics {
  configName: string;
  size: number;
  dataset: string;
  buildTimeMs?: number;
  indexSizeBytes?: number;
  indexSizePretty?: string;
  execP50Ms: number;
  execP95Ms: number;
  execMeanMs: number;
  clientRtP50Ms: number;
  recallAt3: number;
  underfilledCount: number;
  underfilledPct: number;
}

async function getIndexSize(client: pg.Client, indexName: string): Promise<{ bytes: number; pretty: string }> {
  try {
    const res = await client.query(
      `SELECT pg_relation_size($1::regclass) as bytes, pg_size_pretty(pg_relation_size($1::regclass)) as pretty;`,
      [indexName]
    );
    return { bytes: Number(res.rows[0].bytes), pretty: res.rows[0].pretty };
  } catch {
    return { bytes: 0, pretty: '0 bytes' };
  }
}

async function runQueriesOnConfig(
  client: pg.Client,
  queries: QueryRecord[],
  groundTruthIds: string[][],
  configName: string,
  size: number,
  dataset: string,
  buildTimeMs?: number,
  indexSize?: { bytes: number; pretty: string }
): Promise<ExecMetrics> {
  const execTimes: number[] = [];
  const rtTimes: number[] = [];
  let underfilled = 0;
  let matches = 0;

  for (let i = 0; i < queries.length; i++) {
    const q = queries[i]!;
    const gt = new Set(groundTruthIds[i] ?? []);

    const t0 = performance.now();
    const res = await client.query(
      `SELECT id FROM knowledge_bench WHERE domain = $1 AND topic = $2 ORDER BY embedding <=> $3 LIMIT 3;`,
      [q.domain, q.topic, q.vector]
    );
    rtTimes.push(performance.now() - t0);

    const ids = res.rows.map((r: any) => r.id);
    if (ids.length < 3) underfilled++;

    for (const id of ids) {
      if (gt.has(id)) matches++;
    }

    const explainRes = await client.query(
      `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
       SELECT id FROM knowledge_bench WHERE domain = $1 AND topic = $2 ORDER BY embedding <=> $3 LIMIT 3;`,
      [q.domain, q.topic, q.vector]
    );
    execTimes.push(explainRes.rows[0]['QUERY PLAN'][0]['Execution Time']);
  }

  return {
    configName,
    size,
    dataset,
    buildTimeMs: buildTimeMs ? Math.round(buildTimeMs) : undefined,
    indexSizeBytes: indexSize?.bytes,
    indexSizePretty: indexSize?.pretty,
    execP50Ms: percentile(execTimes, 50),
    execP95Ms: percentile(execTimes, 95),
    execMeanMs: Number((execTimes.reduce((a, b) => a + b, 0) / execTimes.length).toFixed(3)),
    clientRtP50Ms: percentile(rtTimes, 50),
    recallAt3: Number((matches / (queries.length * 3)).toFixed(4)),
    underfilledCount: underfilled,
    underfilledPct: Number(((underfilled / queries.length) * 100).toFixed(1)),
  };
}

async function main() {
  const client = new pg.Client({
    host: 'localhost',
    port: 5432,
    user: 'orchestrai',
    password: process.env.LOCAL_DB_PASSWORD || 'postgres',
    database: 'orchestrai_bench',
  });
  await client.connect();

  console.log('Starting Clustered Benchmark (Gaussian mixture 50 clusters)...');
  const centroids = generateClusterCentroids(50);
  const getVec = () => sampleClusteredVector(centroids);

  await client.query('DROP TABLE IF EXISTS knowledge_bench CASCADE;');
  await client.query(`
    CREATE TABLE knowledge_bench (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      content text NOT NULL,
      domain text NOT NULL,
      topic text NOT NULL,
      embedding vector(768) NOT NULL
    );
  `);

  const QUERY_COUNT = 30; // 30 queries for speed and efficiency
  const queries: QueryRecord[] = [];
  for (let i = 0; i < QUERY_COUNT; i++) {
    const domain = DOMAIN_KEYS[i % DOMAIN_KEYS.length]!;
    const topics = DOMAINS[domain]!;
    const topic = topics[Math.floor((i / DOMAIN_KEYS.length) % topics.length)]!;
    queries.push({ domain, topic, vector: getVec() });
  }

  const SIZES = [1000, 10000, 50000];
  let currentCount = 0;
  const clusteredMetrics: ExecMetrics[] = [];

  for (const size of SIZES) {
    console.log(`\n--- Size: ${size.toLocaleString()} rows (Clustered) ---`);
    const needed = size - currentCount;
    const BATCH = 1000;
    let ins = 0;
    while (ins < needed) {
      const batchSize = Math.min(BATCH, needed - ins);
      const rows: string[] = [];
      for (let b = 0; b < batchSize; b++) {
        const domain = DOMAIN_KEYS[Math.floor(Math.random() * DOMAIN_KEYS.length)]!;
        const topics = DOMAINS[domain]!;
        const topic = topics[Math.floor(Math.random() * topics.length)]!;
        rows.push(`('doc ${currentCount + ins + b + 1}', '${domain}', '${topic}', '${getVec()}'::vector)`);
      }
      await client.query(`INSERT INTO knowledge_bench (content, domain, topic, embedding) VALUES ${rows.join(',')};`);
      ins += batchSize;
    }
    currentCount = size;
    await client.query('VACUUM ANALYZE knowledge_bench;');

    // 1. Exact Scan
    const groundTruthIds: string[][] = [];
    for (const q of queries) {
      const res = await client.query(
        `SELECT id FROM knowledge_bench WHERE domain = $1 AND topic = $2 ORDER BY embedding <=> $3 LIMIT 3;`,
        [q.domain, q.topic, q.vector]
      );
      groundTruthIds.push(res.rows.map((r: any) => r.id));
    }
    const exactM = await runQueriesOnConfig(client, queries, groundTruthIds, 'Exact Scan (no index)', size, 'clustered');
    clusteredMetrics.push(exactM);
    console.log(`  [Exact] Exec p50: ${exactM.execP50Ms}ms | Recall: 100%`);

    // 2. Exact with B-Tree
    const tB0 = performance.now();
    await client.query('CREATE INDEX knowledge_bench_btree_idx ON knowledge_bench (domain, topic);');
    const bTime = performance.now() - tB0;
    const bSize = await getIndexSize(client, 'knowledge_bench_btree_idx');
    const btreeM = await runQueriesOnConfig(client, queries, groundTruthIds, 'Exact Scan WITH B-Tree (domain, topic)', size, 'clustered', bTime, bSize);
    clusteredMetrics.push(btreeM);
    console.log(`  [BTree] Exec p50: ${btreeM.execP50Ms}ms | Recall: 100%`);
    await client.query('DROP INDEX knowledge_bench_btree_idx;');

    // 3. HNSW
    const tH0 = performance.now();
    await client.query('CREATE INDEX knowledge_bench_hnsw_idx ON knowledge_bench USING hnsw (embedding vector_cosine_ops);');
    const hTime = performance.now() - tH0;
    const hSize = await getIndexSize(client, 'knowledge_bench_hnsw_idx');

    for (const cfg of [
      { ef: 40, iter: 'relaxed_order', label: 'HNSW ef=40 (relaxed_order)' },
      { ef: 100, iter: 'relaxed_order', label: 'HNSW ef=100 (relaxed_order)' },
      { ef: 200, iter: 'relaxed_order', label: 'HNSW ef=200 (relaxed_order)' },
    ]) {
      await client.query(`SET hnsw.ef_search = ${cfg.ef};`);
      await client.query(`SET hnsw.iterative_scan = '${cfg.iter}';`);
      const hM = await runQueriesOnConfig(client, queries, groundTruthIds, cfg.label, size, 'clustered', hTime, hSize);
      clusteredMetrics.push(hM);
      console.log(`  [${cfg.label}] Exec p50: ${hM.execP50Ms}ms | Recall@3: ${(hM.recallAt3 * 100).toFixed(1)}%`);
    }
    await client.query('DROP INDEX knowledge_bench_hnsw_idx;');

    // 4. Partial HNSW
    const tP0 = performance.now();
    let pBytes = 0;
    for (const d of DOMAIN_KEYS) {
      await client.query(`CREATE INDEX knowledge_bench_hnsw_${d}_idx ON knowledge_bench USING hnsw (embedding vector_cosine_ops) WHERE domain = '${d}';`);
      const sz = await getIndexSize(client, `knowledge_bench_hnsw_${d}_idx`);
      pBytes += sz.bytes;
    }
    const pTime = performance.now() - tP0;
    await client.query('SET hnsw.ef_search = 40;');
    await client.query("SET hnsw.iterative_scan = 'relaxed_order';");
    const partM = await runQueriesOnConfig(client, queries, groundTruthIds, 'Per-Domain Partial HNSW (ef=40, relaxed_order)', size, 'clustered', pTime, { bytes: pBytes, pretty: `${(pBytes / 1024 / 1024).toFixed(1)} MB` });
    clusteredMetrics.push(partM);
    console.log(`  [Partial HNSW] Exec p50: ${partM.execP50Ms}ms | Recall@3: ${(partM.recallAt3 * 100).toFixed(1)}%`);
    for (const d of DOMAIN_KEYS) {
      await client.query(`DROP INDEX knowledge_bench_hnsw_${d}_idx;`);
    }
  }

  // Cleanup scratch table
  await client.query('DROP TABLE IF EXISTS knowledge_bench CASCADE;');
  await client.query('VACUUM FULL;');
  await client.end();

  const outPath = path.resolve(process.cwd(), '../benchmarks/results/crossover-clustered.json');
  await fs.writeFile(outPath, JSON.stringify(clusteredMetrics, null, 2), 'utf8');
  console.log(`Clustered benchmark results written to: ${outPath}`);
}

main().catch(console.error);

