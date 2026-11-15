// scripts/run-crossover-redo.ts
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

function randomUnitVector(): string {
  const vec = new Float32Array(DIM);
  let sumSq = 0;
  for (let i = 0; i < DIM; i++) {
    const v = (Math.random() - 0.5) * 2;
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

// Generate 50 cluster centers for clustered dataset
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
    // Box-Muller normal sample
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
  underfilledCount: number; // queries returning < 3 rows
  underfilledPct: number;
}

async function getIndexSize(client: pg.Client, indexName: string): Promise<{ bytes: number; pretty: string }> {
  try {
    const res = await client.query(
      `SELECT pg_relation_size($1::regclass) as bytes, pg_size_pretty(pg_relation_size($1::regclass)) as pretty;`,
      [indexName]
    );
    return {
      bytes: Number(res.rows[0].bytes),
      pretty: res.rows[0].pretty,
    };
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
    const rt = performance.now() - t0;
    rtTimes.push(rt);

    const ids = res.rows.map((r: any) => r.id);
    if (ids.length < 3) underfilled++;

    for (const id of ids) {
      if (gt.has(id)) matches++;
    }

    // EXPLAIN ANALYZE for execution time
    const explainRes = await client.query(
      `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
       SELECT id FROM knowledge_bench WHERE domain = $1 AND topic = $2 ORDER BY embedding <=> $3 LIMIT 3;`,
      [q.domain, q.topic, q.vector]
    );
    const execTime = explainRes.rows[0]['QUERY PLAN'][0]['Execution Time'];
    execTimes.push(execTime);
  }

  const recall = Number((matches / (queries.length * 3)).toFixed(4));

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
    recallAt3: recall,
    underfilledCount: underfilled,
    underfilledPct: Number(((underfilled / queries.length) * 100).toFixed(1)),
  };
}

async function benchmarkDataset(dataset: 'uniform' | 'clustered', benchClient: pg.Client): Promise<ExecMetrics[]> {
  console.log(`\n======================================================================`);
  console.log(`  STARTING BENCHMARK DATASET: ${dataset.toUpperCase()}`);
  console.log(`======================================================================`);

  const centroids = dataset === 'clustered' ? generateClusterCentroids(50) : [];
  const getVec = () => (dataset === 'clustered' ? sampleClusteredVector(centroids) : randomUnitVector());

  // Truncate and reset table
  await benchClient.query('DROP TABLE IF EXISTS knowledge_bench CASCADE;');
  await benchClient.query(`
    CREATE TABLE knowledge_bench (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      content text NOT NULL,
      domain text NOT NULL,
      topic text NOT NULL,
      embedding vector(768) NOT NULL
    );
  `);

  // Generate 50 queries
  const QUERY_COUNT = 50;
  const queries: QueryRecord[] = [];
  for (let i = 0; i < QUERY_COUNT; i++) {
    const domain = DOMAIN_KEYS[i % DOMAIN_KEYS.length]!;
    const topics = DOMAINS[domain]!;
    const topic = topics[Math.floor((i / DOMAIN_KEYS.length) % topics.length)]!;
    queries.push({
      domain,
      topic,
      vector: getVec(),
    });
  }

  const SIZES = [1000, 10000, 50000, 100000];
  let currentCount = 0;
  const allMetrics: ExecMetrics[] = [];

  for (const size of SIZES) {
    console.log(`\n-------------------------------------------------------------`);
    console.log(`  Dataset: ${dataset} | Target Size: ${size.toLocaleString()} rows`);
    console.log(`-------------------------------------------------------------`);

    // Insert rows
    const needed = size - currentCount;
    if (needed > 0) {
      console.log(`Inserting ${needed.toLocaleString()} rows...`);
      const BATCH = 1000;
      let ins = 0;
      while (ins < needed) {
        const batchSize = Math.min(BATCH, needed - ins);
        const rows: string[] = [];
        for (let b = 0; b < batchSize; b++) {
          const domain = DOMAIN_KEYS[Math.floor(Math.random() * DOMAIN_KEYS.length)]!;
          const topics = DOMAINS[domain]!;
          const topic = topics[Math.floor(Math.random() * topics.length)]!;
          const vec = getVec();
          rows.push(`('doc ${currentCount + ins + b + 1}', '${domain}', '${topic}', '${vec}'::vector)`);
        }
        await benchClient.query(`INSERT INTO knowledge_bench (content, domain, topic, embedding) VALUES ${rows.join(',')};`);
        ins += batchSize;
        if (ins % 10000 === 0 || ins === needed) {
          console.log(`  Inserted ${ins.toLocaleString()} / ${needed.toLocaleString()}`);
        }
      }
      currentCount = size;
      await benchClient.query('VACUUM ANALYZE knowledge_bench;');
    }

    // 1. Exact Scan (No Index) — this is also the ground truth
    console.log(`[${size}] 1. Exact Scan (no index)...`);
    // Collect ground truth IDs first
    const groundTruthIds: string[][] = [];
    for (const q of queries) {
      const res = await benchClient.query(
        `SELECT id FROM knowledge_bench WHERE domain = $1 AND topic = $2 ORDER BY embedding <=> $3 LIMIT 3;`,
        [q.domain, q.topic, q.vector]
      );
      groundTruthIds.push(res.rows.map((r: any) => r.id));
    }

    const exactNoIndex = await runQueriesOnConfig(
      benchClient,
      queries,
      groundTruthIds,
      'Exact Scan (no index)',
      size,
      dataset
    );
    allMetrics.push(exactNoIndex);
    console.log(`  Exec p50: ${exactNoIndex.execP50Ms}ms, p95: ${exactNoIndex.execP95Ms}ms | Recall: 100%`);

    // 2. Exact Scan WITH B-Tree index on (domain, topic)
    console.log(`[${size}] 2. Exact Scan WITH B-Tree index on (domain, topic)...`);
    const tBt0 = performance.now();
    await benchClient.query('CREATE INDEX knowledge_bench_btree_idx ON knowledge_bench (domain, topic);');
    const btBuildTime = performance.now() - tBt0;
    const btSize = await getIndexSize(benchClient, 'knowledge_bench_btree_idx');
    await benchClient.query('VACUUM ANALYZE knowledge_bench;');

    const exactWithBtree = await runQueriesOnConfig(
      benchClient,
      queries,
      groundTruthIds,
      'Exact Scan WITH B-Tree (domain, topic)',
      size,
      dataset,
      btBuildTime,
      btSize
    );
    allMetrics.push(exactWithBtree);
    console.log(`  Build: ${btBuildTime.toFixed(0)}ms, Size: ${btSize.pretty} | Exec p50: ${exactWithBtree.execP50Ms}ms, p95: ${exactWithBtree.execP95Ms}ms | Recall: 100%`);
    await benchClient.query('DROP INDEX knowledge_bench_btree_idx;');

    // 3. Global HNSW Index
    console.log(`[${size}] 3. Building global HNSW index...`);
    const tHnsw0 = performance.now();
    await benchClient.query('CREATE INDEX knowledge_bench_hnsw_idx ON knowledge_bench USING hnsw (embedding vector_cosine_ops);');
    const hnswBuildTime = performance.now() - tHnsw0;
    const hnswSize = await getIndexSize(benchClient, 'knowledge_bench_hnsw_idx');
    await benchClient.query('VACUUM ANALYZE knowledge_bench;');
    console.log(`  HNSW Built in ${hnswBuildTime.toFixed(0)}ms, Size: ${hnswSize.pretty}`);

    // HNSW configurations
    const hnswConfigs: Array<{ ef_search: number; iterative: 'off' | 'relaxed_order' | 'strict_order'; label: string }> = [
      { ef_search: 40, iterative: 'off', label: 'HNSW ef=40 (iterative_scan=off)' },
      { ef_search: 40, iterative: 'relaxed_order', label: 'HNSW ef=40 (relaxed_order)' },
      { ef_search: 40, iterative: 'strict_order', label: 'HNSW ef=40 (strict_order)' },
      { ef_search: 100, iterative: 'relaxed_order', label: 'HNSW ef=100 (relaxed_order)' },
      { ef_search: 100, iterative: 'strict_order', label: 'HNSW ef=100 (strict_order)' },
      { ef_search: 200, iterative: 'relaxed_order', label: 'HNSW ef=200 (relaxed_order)' },
      { ef_search: 200, iterative: 'strict_order', label: 'HNSW ef=200 (strict_order)' },
    ];

    for (const cfg of hnswConfigs) {
      await benchClient.query(`SET hnsw.ef_search = ${cfg.ef_search};`);
      await benchClient.query(`SET hnsw.iterative_scan = '${cfg.iterative}';`);

      const res = await runQueriesOnConfig(
        benchClient,
        queries,
        groundTruthIds,
        cfg.label,
        size,
        dataset,
        hnswBuildTime,
        hnswSize
      );
      allMetrics.push(res);
      console.log(`  [${cfg.label}] Exec p50: ${res.execP50Ms}ms, p95: ${res.execP95Ms}ms | Recall@3: ${(res.recallAt3 * 100).toFixed(1)}% | Underfilled: ${res.underfilledCount}/${QUERY_COUNT} (${res.underfilledPct}%)`);
    }

    // Reset settings & drop global HNSW
    await benchClient.query("SET hnsw.iterative_scan = 'relaxed_order';");
    await benchClient.query('SET hnsw.ef_search = 40;');
    await benchClient.query('DROP INDEX knowledge_bench_hnsw_idx;');

    // 4. Per-domain Partial HNSW Indexes
    console.log(`[${size}] 4. Building 5 partial per-domain HNSW indexes...`);
    const tPart0 = performance.now();
    let totalPartBytes = 0;
    for (const d of DOMAIN_KEYS) {
      await benchClient.query(`CREATE INDEX knowledge_bench_hnsw_${d}_idx ON knowledge_bench USING hnsw (embedding vector_cosine_ops) WHERE domain = '${d}';`);
      const pSize = await getIndexSize(benchClient, `knowledge_bench_hnsw_${d}_idx`);
      totalPartBytes += pSize.bytes;
    }
    const partBuildTime = performance.now() - tPart0;
    const partSizePretty = `${(totalPartBytes / 1024 / 1024).toFixed(1)} MB`;
    await benchClient.query('VACUUM ANALYZE knowledge_bench;');

    await benchClient.query('SET hnsw.ef_search = 40;');
    await benchClient.query("SET hnsw.iterative_scan = 'relaxed_order';");

    const partialMetrics = await runQueriesOnConfig(
      benchClient,
      queries,
      groundTruthIds,
      'Per-Domain Partial HNSW (ef=40, relaxed_order)',
      size,
      dataset,
      partBuildTime,
      { bytes: totalPartBytes, pretty: partSizePretty }
    );
    allMetrics.push(partialMetrics);
    console.log(`  [Partial HNSW] Build: ${partBuildTime.toFixed(0)}ms, Total Size: ${partSizePretty} | Exec p50: ${partialMetrics.execP50Ms}ms, p95: ${partialMetrics.execP95Ms}ms | Recall@3: ${(partialMetrics.recallAt3 * 100).toFixed(1)}%`);

    for (const d of DOMAIN_KEYS) {
      await benchClient.query(`DROP INDEX knowledge_bench_hnsw_${d}_idx;`);
    }
  }

  return allMetrics;
}

async function main() {
  console.log('='.repeat(70));
  console.log('  Comprehensive Crossover Benchmark Redo');
  console.log('  Local Docker Postgres 16.15 + pgvector 0.8.6');
  console.log('='.repeat(70));

  const client = new pg.Client({
    host: 'localhost',
    port: 5432,
    user: 'orchestrai',
    password: process.env.LOCAL_DB_PASSWORD || 'postgres',
    database: 'orchestrai_bench',
  });
  await client.connect();

  const dbV = (await client.query('SELECT version();')).rows[0].version;
  const extV = (await client.query("SELECT extversion FROM pg_extension WHERE extname = 'vector';")).rows[0].extversion;

  // Run on uniform dataset
  const uniformMetrics = await benchmarkDataset('uniform', client);

  // Run on clustered dataset
  const clusteredMetrics = await benchmarkDataset('clustered', client);

  await client.end();

  const finalOutput = {
    metadata: {
      generatedAt: new Date().toISOString(),
      machine: 'Windows 11 x86_64 / WSL2 Docker',
      postgresVersion: dbV,
      pgvectorVersion: extV,
      database: 'orchestrai_bench (local Docker Postgres)',
      vectorDimension: DIM,
      domains: DOMAIN_KEYS,
      partitionsCount: 20,
      queryCountPerConfig: 50,
      dataSource: 'synthetic vectors (uniform unit sphere & 50-cluster Gaussian mixture; latency and ANN recall valid, not semantic quality)',
    },
    uniform: uniformMetrics,
    clustered: clusteredMetrics,
  };

  const rootDir = path.resolve(process.cwd(), '..');
  const outPath = path.resolve(rootDir, 'benchmarks/results/crossover-benchmark-redo.json');
  await fs.writeFile(outPath, JSON.stringify(finalOutput, null, 2), 'utf8');
  console.log(`\n======================================================================`);
  console.log(`✅ Crossover benchmark redo complete!`);
  console.log(`Results saved to: ${outPath}`);
  console.log(`======================================================================\n`);
}

main().catch(console.error);

