// scripts/benchmark-crossover.ts
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

function randomUnitVector(dim = 768): string {
  const vec = new Float32Array(dim);
  let sumSq = 0;
  for (let i = 0; i < dim; i++) {
    const v = (Math.random() - 0.5) * 2;
    vec[i] = v;
    sumSq += v * v;
  }
  const norm = Math.sqrt(sumSq);
  const out = new Array<string>(dim);
  for (let i = 0; i < dim; i++) {
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

async function ensureScratchDb(): Promise<void> {
  const adminClient = new pg.Client({
    host: 'localhost',
    port: 5432,
    user: 'orchestrai',
    password: process.env.LOCAL_DB_PASSWORD || 'postgres',
    database: 'orchestrai',
  });
  await adminClient.connect();
  const res = await adminClient.query(
    "SELECT 1 FROM pg_database WHERE datname = 'orchestrai_bench'"
  );
  if (res.rows.length === 0) {
    console.log('Creating database orchestrai_bench...');
    await adminClient.query('CREATE DATABASE orchestrai_bench');
  }
  await adminClient.end();

  const benchClient = new pg.Client({
    host: 'localhost',
    port: 5432,
    user: 'orchestrai',
    password: process.env.LOCAL_DB_PASSWORD || 'postgres',
    database: 'orchestrai_bench',
  });
  await benchClient.connect();
  await benchClient.query('CREATE EXTENSION IF NOT EXISTS vector;');
  await benchClient.query(`
    CREATE TABLE IF NOT EXISTS knowledge_bench (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      content text NOT NULL,
      domain text NOT NULL,
      topic text NOT NULL,
      embedding vector(768) NOT NULL
    );
  `);
  await benchClient.query('TRUNCATE TABLE knowledge_bench;');
  await benchClient.query('DROP INDEX IF EXISTS knowledge_bench_hnsw_idx;');
  await benchClient.end();
}

async function insertBatch(
  client: pg.Client,
  totalCount: number,
  currentCount: number
): Promise<void> {
  const needed = totalCount - currentCount;
  if (needed <= 0) return;

  console.log(`Inserting ${needed.toLocaleString()} synthetic rows (target: ${totalCount.toLocaleString()})...`);
  const BATCH_SIZE = 1000;
  let inserted = 0;

  while (inserted < needed) {
    const thisBatch = Math.min(BATCH_SIZE, needed - inserted);
    const rows: string[] = [];

    for (let i = 0; i < thisBatch; i++) {
      const domain = DOMAIN_KEYS[Math.floor(Math.random() * DOMAIN_KEYS.length)]!;
      const topics = DOMAINS[domain]!;
      const topic = topics[Math.floor(Math.random() * topics.length)]!;
      const vec = randomUnitVector();
      const content = `Synthetic document chunk for ${domain} - ${topic} (synthetic vector benchmark row ${currentCount + inserted + i + 1})`;
      rows.push(`('${content.replace(/'/g, "''")}', '${domain}', '${topic}', '${vec}'::vector)`);
    }

    const query = `INSERT INTO knowledge_bench (content, domain, topic, embedding) VALUES ${rows.join(',')};`;
    await client.query(query);
    inserted += thisBatch;
    if (inserted % 10000 === 0 || inserted === needed) {
      console.log(`  Inserted ${inserted.toLocaleString()} / ${needed.toLocaleString()}...`);
    }
  }

  // Analyze to update stats
  console.log('Running VACUUM ANALYZE...');
  await client.query('VACUUM ANALYZE knowledge_bench;');
}

interface QueryResultRecord {
  serverExecutionMs: number;
  clientRoundTripMs: number;
  rowsScanned: number;
  topIds: string[];
}

async function runBenchmarkQueries(
  client: pg.Client,
  queryVectors: Array<{ domain: string; topic: string; vector: string }>
): Promise<QueryResultRecord[]> {
  const results: QueryResultRecord[] = [];

  for (const q of queryVectors) {
    const t0 = performance.now();
    // 1. Get exact top 3 IDs and distances
    const actualRes = await client.query(
      `SELECT id FROM knowledge_bench WHERE domain = $1 AND topic = $2 ORDER BY embedding <=> $3 LIMIT 3;`,
      [q.domain, q.topic, q.vector]
    );
    const topIds = actualRes.rows.map((r: any) => r.id);

    // 2. EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
    const explainRes = await client.query(
      `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
       SELECT id FROM knowledge_bench WHERE domain = $1 AND topic = $2 ORDER BY embedding <=> $3 LIMIT 3;`,
      [q.domain, q.topic, q.vector]
    );
    const clientRoundTripMs = Number((performance.now() - t0).toFixed(3));

    const planData = explainRes.rows[0]['QUERY PLAN'][0];
    const serverExecutionMs = planData['Execution Time'];

    // Find rows scanned in the plan tree
    let rowsScanned = 0;
    function walkPlan(node: any) {
      if (node['Actual Rows']) {
        rowsScanned += node['Actual Rows'];
      }
      if (node['Rows Removed by Filter']) {
        rowsScanned += node['Rows Removed by Filter'];
      }
      if (node.Plans) {
        for (const child of node.Plans) walkPlan(child);
      }
    }
    walkPlan(planData.Plan);

    results.push({
      serverExecutionMs,
      clientRoundTripMs,
      rowsScanned,
      topIds,
    });
  }

  return results;
}

async function main() {
  console.log('='.repeat(70));
  console.log('  Pgvector Crossover Benchmark: Exact Scan vs HNSW');
  console.log('  Machine: Local Docker Postgres 16.15 / pgvector 0.8.6');
  console.log('='.repeat(70));

  await ensureScratchDb();

  const benchClient = new pg.Client({
    host: 'localhost',
    port: 5432,
    user: 'orchestrai',
    password: process.env.LOCAL_DB_PASSWORD || 'postgres',
    database: 'orchestrai_bench',
  });
  await benchClient.connect();

  const dbVersionRes = await benchClient.query('SELECT version();');
  const pgVersion = dbVersionRes.rows[0].version;
  const extRes = await benchClient.query("SELECT extversion FROM pg_extension WHERE extname = 'vector';");
  const pgvectorVersion = extRes.rows[0].extversion;

  console.log(`PostgreSQL: ${pgVersion}`);
  console.log(`pgvector: ${pgvectorVersion}`);

  // Generate 200 deterministic query vectors
  const QUERY_COUNT = 200;
  console.log(`Generating ${QUERY_COUNT} random query vectors across 5 domains x 4 topics...`);
  const queryVectors: Array<{ domain: string; topic: string; vector: string }> = [];
  for (let i = 0; i < QUERY_COUNT; i++) {
    const domain = DOMAIN_KEYS[i % DOMAIN_KEYS.length]!;
    const topics = DOMAINS[domain]!;
    const topic = topics[Math.floor((i / DOMAIN_KEYS.length) % topics.length)]!;
    queryVectors.push({
      domain,
      topic,
      vector: randomUnitVector(),
    });
  }

  const SIZES = [1000, 10000, 50000, 100000];
  const exactResults: Record<number, any> = {};
  const exactTopIdsMap: Record<number, string[][]> = {};

  let currentCount = 0;

  // Phase 1: Exact Scans across sizes
  console.log('\n--- Phase 1: Exact Scans (No Index) ---');
  for (const size of SIZES) {
    await insertBatch(benchClient, size, currentCount);
    currentCount = size;

    console.log(`Running ${QUERY_COUNT} exact queries on size ${size.toLocaleString()}...`);
    const qResults = await runBenchmarkQueries(benchClient, queryVectors);

    const execTimes = qResults.map((r) => r.serverExecutionMs);
    const rtTimes = qResults.map((r) => r.clientRoundTripMs);
    const scanned = qResults.map((r) => r.rowsScanned);

    exactResults[size] = {
      size,
      index: 'none (exact scan)',
      serverExecutionMs: {
        p50: percentile(execTimes, 50),
        p95: percentile(execTimes, 95),
        mean: Number((execTimes.reduce((a, b) => a + b, 0) / execTimes.length).toFixed(3)),
      },
      clientRoundTripMs: {
        p50: percentile(rtTimes, 50),
        p95: percentile(rtTimes, 95),
        mean: Number((rtTimes.reduce((a, b) => a + b, 0) / rtTimes.length).toFixed(3)),
      },
      rowsScanned: {
        p50: percentile(scanned, 50),
        p95: percentile(scanned, 95),
        mean: Math.round(scanned.reduce((a, b) => a + b, 0) / scanned.length),
      },
    };
    exactTopIdsMap[size] = qResults.map((r) => r.topIds);

    console.log(`  [Exact ${size.toLocaleString()}] Server Exec p50: ${exactResults[size].serverExecutionMs.p50}ms, p95: ${exactResults[size].serverExecutionMs.p95}ms | Client RT p50: ${exactResults[size].clientRoundTripMs.p50}ms | Rows Scanned p50: ${exactResults[size].rowsScanned.p50}`);
  }

  // Phase 2: Create HNSW Index and benchmark
  console.log('\n--- Phase 2: HNSW Index on 100,000 rows ---');
  console.log('Building HNSW index (vector_cosine_ops)...');
  const tIndex0 = performance.now();
  await benchClient.query(`
    CREATE INDEX knowledge_bench_hnsw_idx 
    ON knowledge_bench 
    USING hnsw (embedding vector_cosine_ops);
  `);
  const indexBuildTimeSec = Number(((performance.now() - tIndex0) / 1000).toFixed(1));
  console.log(`HNSW index built in ${indexBuildTimeSec} seconds.`);
  await benchClient.query('VACUUM ANALYZE knowledge_bench;');

  console.log(`Running ${QUERY_COUNT} HNSW queries on size 100,000...`);
  const hnswResults100k = await runBenchmarkQueries(benchClient, queryVectors);

  const hnswExecTimes = hnswResults100k.map((r) => r.serverExecutionMs);
  const hnswRtTimes = hnswResults100k.map((r) => r.clientRoundTripMs);
  const hnswScanned = hnswResults100k.map((r) => r.rowsScanned);

  // Calculate Recall@3 vs Exact Top 3
  const exact100k = exactTopIdsMap[100000]!;
  let totalMatches = 0;
  for (let i = 0; i < QUERY_COUNT; i++) {
    const exactIds = new Set(exact100k[i]);
    const hnswIds = hnswResults100k[i]!.topIds;
    let match = 0;
    for (const id of hnswIds) {
      if (exactIds.has(id)) match++;
    }
    totalMatches += match;
  }
  const recallAt3 = Number((totalMatches / (QUERY_COUNT * 3)).toFixed(4));

  const hnswSummary = {
    size: 100000,
    index: 'hnsw (vector_cosine_ops)',
    indexBuildTimeSec,
    recallAt3,
    serverExecutionMs: {
      p50: percentile(hnswExecTimes, 50),
      p95: percentile(hnswExecTimes, 95),
      mean: Number((hnswExecTimes.reduce((a, b) => a + b, 0) / hnswExecTimes.length).toFixed(3)),
    },
    clientRoundTripMs: {
      p50: percentile(hnswRtTimes, 50),
      p95: percentile(hnswRtTimes, 95),
      mean: Number((hnswRtTimes.reduce((a, b) => a + b, 0) / hnswRtTimes.length).toFixed(3)),
    },
    rowsScanned: {
      p50: percentile(hnswScanned, 50),
      p95: percentile(hnswScanned, 95),
      mean: Math.round(hnswScanned.reduce((a, b) => a + b, 0) / hnswScanned.length),
    },
  };

  console.log(`  [HNSW 100,000] Server Exec p50: ${hnswSummary.serverExecutionMs.p50}ms, p95: ${hnswSummary.serverExecutionMs.p95}ms | Client RT p50: ${hnswSummary.clientRoundTripMs.p50}ms | Recall@3: ${(recallAt3 * 100).toFixed(1)}%`);

  await benchClient.end();

  const finalReport = {
    metadata: {
      generatedAt: new Date().toISOString(),
      machine: 'Windows 11 x86_64 / WSL2 Docker',
      postgresVersion: pgVersion,
      pgvectorVersion,
      database: 'orchestrai_bench (local Docker scratch database)',
      vectorDimension: 768,
      domains: DOMAIN_KEYS,
      partitionsCount: 20,
      queryCount: QUERY_COUNT,
      dataSource: 'synthetic vectors (random unit vectors; latency and ANN recall valid, not semantic quality)',
    },
    exactScans: exactResults,
    hnswIndex: hnswSummary,
  };

  const outPath = path.resolve(process.cwd(), '../benchmarks/results/crossover-benchmark.json');
  await fs.writeFile(outPath, JSON.stringify(finalReport, null, 2), 'utf-8');
  console.log(`\nBenchmark output saved to: ${outPath}`);
}

main().catch((err) => {
  console.error('Fatal error in crossover benchmark:', err);
  process.exit(1);
});

