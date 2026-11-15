// scripts/run-retrieval-eval.ts
import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { db } from '../src/persistence/db/client.js';
import { knowledgeDocuments } from '../src/persistence/db/schema.js';
import { embedDocument } from '../src/knowledge/embeddings-client.js';
import { sql } from 'drizzle-orm';

interface PolicyChunk {
  id: string;
  domain: string;
  topic: string;
  title: string;
  content: string;
  metadata: Record<string, unknown>;
}

interface RetrievalQuery {
  id: string;
  query: string;
  expectedChunkId: string;
  expectedDomain: string;
  topic: string;
}

export async function runRetrievalEvaluation() {
  console.log('='.repeat(70));
  console.log('  Customer Support Retrieval Benchmark (hit@1 & hit@3)');
  console.log('='.repeat(70));

  const seedPath = path.resolve('../seed/knowledge-expanded.json');
  const evalPath = path.resolve('../eval/retrieval-queries.json');

  const chunks: PolicyChunk[] = JSON.parse(await fs.readFile(seedPath, 'utf-8'));
  const queries: RetrievalQuery[] = JSON.parse(await fs.readFile(evalPath, 'utf-8'));

  console.log(`Loaded ${chunks.length} policy chunks and ${queries.length} evaluation queries.`);

  // 1. Ingest expanded corpus
  console.log('\n--- Step 1: Ingesting Expanded Corpus into PostgreSQL ---');
  await db.delete(knowledgeDocuments);

  const chunkIdToDocId = new Map<string, string>();
  let ingested = 0;

  for (const chunk of chunks) {
    const embedding = await embedDocument(chunk.content);
    const vectorString = `[${embedding.join(',')}]`;

    const res = await db.execute(sql`
      INSERT INTO knowledge_documents (domain, document_type, topic, version, effective_date, content, embedding)
      VALUES (${chunk.domain}, 'policy', ${chunk.topic}, ${chunk.id}, NOW(), ${chunk.content}, ${vectorString}::vector)
      RETURNING id;
    `);

    const insertedId = res.rows[0]?.id as string;
    chunkIdToDocId.set(chunk.id, insertedId);
    ingested++;
    if (ingested % 10 === 0 || ingested === chunks.length) {
      console.log(`  Embedded & ingested ${ingested}/${chunks.length} chunks...`);
    }
  }

  // 2. Evaluate queries
  console.log('\n--- Step 2: Evaluating 30 Labeled Queries with Real Embeddings ---');
  interface QueryResult {
    queryId: string;
    query: string;
    domain: string;
    topic: string;
    expectedChunkId: string;
    hitAt1: boolean;
    hitAt3: boolean;
    retrievedChunkIds: string[];
    topSimilarity: number;
  }

  const queryResults: QueryResult[] = [];

  for (const q of queries) {
    const queryEmbedding = await embedDocument(q.query);
    const vectorString = `[${queryEmbedding.join(',')}]`;

    // Scoped cosine distance top 3
    const res = await db.execute(sql`
      SELECT 
        version as chunk_id,
        content,
        1 - (embedding <=> ${vectorString}::vector) as similarity
      FROM knowledge_documents
      WHERE domain = ${q.expectedDomain}
      ORDER BY embedding <=> ${vectorString}::vector
      LIMIT 3;
    `);

    const topChunks = res.rows.map((r: any) => r.chunk_id as string);
    const topSim = res.rows[0]?.similarity ? Number(res.rows[0].similarity) : 0;

    const hitAt1 = topChunks[0] === q.expectedChunkId;
    const hitAt3 = topChunks.includes(q.expectedChunkId);

    queryResults.push({
      queryId: q.id,
      query: q.query,
      domain: q.expectedDomain,
      topic: q.topic,
      expectedChunkId: q.expectedChunkId,
      hitAt1,
      hitAt3,
      retrievedChunkIds: topChunks,
      topSimilarity: Number(topSim.toFixed(4)),
    });

    console.log(
      `  [${q.id}] ${q.query.slice(0, 45).padEnd(48)} -> Target: ${q.expectedChunkId} | Top: ${topChunks[0] ?? 'none'} | hit@1: ${hitAt1 ? '✅' : '❌'} | hit@3: ${hitAt3 ? '✅' : '❌'}`
    );
  }

  // 3. Aggregate metrics
  const domains = ['orders', 'payments', 'account'];
  const domainMetrics: Record<string, { total: number; hit1: number; hit3: number; hit1Rate: number; hit3Rate: number }> = {};

  for (const d of domains) {
    const dQueries = queryResults.filter((r) => r.domain === d);
    const hit1 = dQueries.filter((r) => r.hitAt1).length;
    const hit3 = dQueries.filter((r) => r.hitAt3).length;
    domainMetrics[d] = {
      total: dQueries.length,
      hit1,
      hit3,
      hit1Rate: dQueries.length > 0 ? Number((hit1 / dQueries.length).toFixed(3)) : 0,
      hit3Rate: dQueries.length > 0 ? Number((hit3 / dQueries.length).toFixed(3)) : 0,
    };
  }

  const overallHit1 = queryResults.filter((r) => r.hitAt1).length;
  const overallHit3 = queryResults.filter((r) => r.hitAt3).length;

  const summary = {
    metadata: {
      generatedAt: new Date().toISOString(),
      embeddingModel: 'text-embedding-004 (768-dim)',
      corpusSize: chunks.length,
      queryCount: queries.length,
      dataSource: 'live model (Gemini embedding) + seeded synthetic corpus',
    },
    overall: {
      totalQueries: queries.length,
      hitAt1Count: overallHit1,
      hitAt3Count: overallHit3,
      hitAt1Rate: Number((overallHit1 / queries.length).toFixed(3)),
      hitAt3Rate: Number((overallHit3 / queries.length).toFixed(3)),
    },
    byDomain: domainMetrics,
    results: queryResults,
  };

  console.log('\n' + '='.repeat(70));
  console.log(`OVERALL RETRIEVAL: hit@1 = ${(summary.overall.hitAt1Rate * 100).toFixed(1)}% | hit@3 = ${(summary.overall.hitAt3Rate * 100).toFixed(1)}%`);
  for (const [d, m] of Object.entries(domainMetrics)) {
    console.log(`  [${d.padEnd(10)}] hit@1: ${m.hit1}/${m.total} (${(m.hit1Rate * 100).toFixed(1)}%) | hit@3: ${m.hit3}/${m.total} (${(m.hit3Rate * 100).toFixed(1)}%)`);
  }
  console.log('='.repeat(70));

  const outPath = path.resolve('../benchmarks/results/retrieval-eval.json');
  await fs.writeFile(outPath, JSON.stringify(summary, null, 2), 'utf-8');
  console.log(`Saved retrieval eval results to: ${outPath}`);
  return summary;
}

if (process.argv[1]?.endsWith('run-retrieval-eval.ts')) {
  runRetrievalEvaluation().catch((err) => {
    console.error('Retrieval eval error:', err);
    process.exit(1);
  });
}

