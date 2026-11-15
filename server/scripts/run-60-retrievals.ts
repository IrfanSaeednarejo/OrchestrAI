import 'dotenv/config';
import { retrieveKnowledge } from '../src/knowledge/retrieval.js';
import { db } from '../src/persistence/db/client.js';
import { retrievalExecutions } from '../src/persistence/db/schema.js';
import { sql } from 'drizzle-orm';
import fs from 'node:fs/promises';
import path from 'node:path';

const QUERIES = [
  // Orders domain (returns & shipping topics)
  { query: 'How do I return an item I bought last week?', domain: 'orders', topic: 'returns' },
  { query: 'What is the return window for clothing items?', domain: 'orders', topic: 'returns' },
  { query: 'Can I exchange an item for a different size?', domain: 'orders', topic: 'returns' },
  { query: 'Where do I drop off my return package?', domain: 'orders', topic: 'returns' },
  { query: 'Do I have to pay for return shipping label?', domain: 'orders', topic: 'returns' },
  { query: 'Are opened beauty products eligible for return?', domain: 'orders', topic: 'returns' },
  { query: 'Can I return an item without original box?', domain: 'orders', topic: 'returns' },
  { query: 'How long do I have to send back a return?', domain: 'orders', topic: 'returns' },
  { query: 'Is international return shipping free?', domain: 'orders', topic: 'returns' },
  { query: 'Can gift items be returned for store credit?', domain: 'orders', topic: 'returns' },
  { query: 'How long does standard delivery usually take?', domain: 'orders', topic: 'shipping' },
  { query: 'Do you offer expedited next-day shipping?', domain: 'orders', topic: 'shipping' },
  { query: 'My package tracking has not updated in 4 days.', domain: 'orders', topic: 'shipping' },
  { query: 'What courier delivers packages to apartment buildings?', domain: 'orders', topic: 'shipping' },
  { query: 'Can I change my delivery address after shipment?', domain: 'orders', topic: 'shipping' },
  { query: 'Do you ship to military APO and FPO addresses?', domain: 'orders', topic: 'shipping' },
  { query: 'What happens if a package is marked delivered but not received?', domain: 'orders', topic: 'shipping' },
  { query: 'Is signature required for high value electronics shipments?', domain: 'orders', topic: 'shipping' },
  { query: 'Why is my shipment delayed due to customs inspection?', domain: 'orders', topic: 'shipping' },
  { query: 'Can I redirect a parcel to a pickup locker?', domain: 'orders', topic: 'shipping' },

  // Payments domain (payments & refunds topics)
  { query: 'What payment methods do you accept at checkout?', domain: 'payments', topic: 'payments' },
  { query: 'Can I pay using PayPal or Apple Pay?', domain: 'payments', topic: 'payments' },
  { query: 'Why was my credit card transaction declined?', domain: 'payments', topic: 'payments' },
  { query: 'Can I split a payment across two separate cards?', domain: 'payments', topic: 'payments' },
  { query: 'Is my credit card information stored securely?', domain: 'payments', topic: 'payments' },
  { query: 'I see a duplicate pending authorization charge on my bank statement.', domain: 'payments', topic: 'payments' },
  { query: 'Can I pay for my purchase using gift cards?', domain: 'payments', topic: 'payments' },
  { query: 'Do you offer installment payment plans like Klarna?', domain: 'payments', topic: 'payments' },
  { query: 'What billing address should I use for foreign cards?', domain: 'payments', topic: 'payments' },
  { query: 'When is my credit card actually charged for preorders?', domain: 'payments', topic: 'payments' },
  { query: 'How long does a refund take to appear on my card?', domain: 'payments', topic: 'refunds' },
  { query: 'My order was canceled, when will I get my money back?', domain: 'payments', topic: 'refunds' },
  { query: 'Can refunds be sent to a different bank account?', domain: 'payments', topic: 'refunds' },
  { query: 'Are shipping costs refunded when returning damaged goods?', domain: 'payments', topic: 'refunds' },
  { query: 'I received only a partial refund, why was tax deducted?', domain: 'payments', topic: 'refunds' },
  { query: 'Will my reward points be refunded if I cancel an order?', domain: 'payments', topic: 'refunds' },
  { query: 'How do I check the status of my issued refund?', domain: 'payments', topic: 'refunds' },
  { query: 'Why has my refund not posted after 10 business days?', domain: 'payments', topic: 'refunds' },
  { query: 'Can a refund be credited as instant store credit?', domain: 'payments', topic: 'refunds' },
  { query: 'What happens if the original card used is closed or expired?', domain: 'payments', topic: 'refunds' },

  // Account domain (account_security topic)
  { query: 'How do I reset my account password?', domain: 'account', topic: 'account_security' },
  { query: 'I did not receive the verification code on my email.', domain: 'account', topic: 'account_security' },
  { query: 'How do I enable two-factor authentication on my profile?', domain: 'account', topic: 'account_security' },
  { query: 'My account was locked after too many failed attempts.', domain: 'account', topic: 'account_security' },
  { query: 'I noticed an unauthorized login attempt from another state.', domain: 'account', topic: 'account_security' },
  { query: 'How do I change the email address linked to my account?', domain: 'account', topic: 'account_security' },
  { query: 'How can I update my account recovery phone number?', domain: 'account', topic: 'account_security' },
  { query: 'Can I delete my account and all personal information?', domain: 'account', topic: 'account_security' },
  { query: 'Why am I asked for an OTP code every time I sign in?', domain: 'account', topic: 'account_security' },
  { query: 'How do I log out of all active browser sessions?', domain: 'account', topic: 'account_security' },
  { query: 'How long does a verification code stay valid before expiring?', domain: 'account', topic: 'account_security' },
  { query: 'Can I use an authenticator app instead of email codes?', domain: 'account', topic: 'account_security' },
  { query: 'Someone changed my account password without my permission.', domain: 'account', topic: 'account_security' },
  { query: 'How do I review recent security events on my account?', domain: 'account', topic: 'account_security' },
  { query: 'What should I do if my account email is compromised?', domain: 'account', topic: 'account_security' },
  { query: 'Can customer support manually reset my account MFA?', domain: 'account', topic: 'account_security' },
  { query: 'How do I verify my identity to approve a sensitive change?', domain: 'account', topic: 'account_security' },
  { query: 'Is biometric login supported on mobile devices?', domain: 'account', topic: 'account_security' },
  { query: 'Why did I get a security alert about a new device login?', domain: 'account', topic: 'account_security' },
  { query: 'How do I revoke API keys or third party app permissions?', domain: 'account', topic: 'account_security' },
];

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = (sorted.length - 1) * p;
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  const weight = idx - lower;
  const lowerVal = sorted[lower] ?? 0;
  const upperVal = sorted[upper] ?? 0;
  return Math.round(lowerVal * (1 - weight) + upperVal * weight);
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return Math.round((arr.reduce((s, x) => s + x, 0) / arr.length) * 10) / 10;
}

async function main() {
  console.log('='.repeat(70));
  console.log('  ORCHESTRAI: 60 RETRIEVAL QUERIES ON LOCAL DOCKER POSTGRES');
  console.log('='.repeat(70));
  console.log(`Executing ${QUERIES.length} real queries with gemini-embedding-2...`);

  // Truncate retrieval_executions in local DB to isolate this run
  await db.execute(sql`TRUNCATE TABLE retrieval_executions;`);

  const results: Array<{
    query: string;
    domain: string;
    topic: string;
    embedMs: number;
    searchMs: number;
    hits: number;
    topSimilarity: number | null;
  }> = [];

  for (let i = 0; i < QUERIES.length; i++) {
    const q = QUERIES[i]!;
    const res = await retrieveKnowledge({
      query: q.query,
      domains: [q.domain as any],
      topics: [q.topic],
      topK: 3,
    }) as any;

    if (!res.success) {
      console.error(`Query ${i + 1} failed:`, res.error);
      continue;
    }

    results.push({
      query: q.query,
      domain: q.domain,
      topic: q.topic,
      embedMs: res.embedMs,
      searchMs: res.searchMs,
      hits: res.data.length,
      topSimilarity: res.data[0]?.similarity ?? null,
    });

    if ((i + 1) % 10 === 0) {
      console.log(`Completed ${i + 1} / ${QUERIES.length} queries...`);
    }
  }

  const embedTimes = results.map(r => r.embedMs);
  const searchTimes = results.map(r => r.searchMs);

  const stats = {
    n: results.length,
    embed_ms: {
      p50: percentile(embedTimes, 0.5),
      p95: percentile(embedTimes, 0.95),
      mean: mean(embedTimes),
      min: Math.min(...embedTimes),
      max: Math.max(...embedTimes),
    },
    search_ms: {
      p50: percentile(searchTimes, 0.5),
      p95: percentile(searchTimes, 0.95),
      mean: mean(searchTimes),
      min: Math.min(...searchTimes),
      max: Math.max(...searchTimes),
    },
  };

  console.log('\n--- 60 Local Retrieval Benchmark Results ---');
  console.log(`Total queries executed (N) : ${stats.n}`);
  console.log(`embed_ms (Gemini API)      : p50 = ${stats.embed_ms.p50}ms, p95 = ${stats.embed_ms.p95}ms (mean: ${stats.embed_ms.mean}ms, min: ${stats.embed_ms.min}ms, max: ${stats.embed_ms.max}ms)`);
  console.log(`search_ms (Local Postgres) : p50 = ${stats.search_ms.p50}ms, p95 = ${stats.search_ms.p95}ms (mean: ${stats.search_ms.mean}ms, min: ${stats.search_ms.min}ms, max: ${stats.search_ms.max}ms)`);

  // Query verification from DB
  const dbVerify = await db.execute(sql`
    SELECT 
      COUNT(*)::int as n,
      PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY embed_ms) AS embed_p50,
      PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY embed_ms) AS embed_p95,
      PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY search_ms) AS search_p50,
      PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY search_ms) AS search_p95
    FROM retrieval_executions;
  `);

  console.log('\n--- DB retrieval_executions Verification ---');
  console.log(dbVerify.rows[0]);

  const output = {
    dataSource: 'Local Docker Postgres (pgvector 0.8.6, PostgreSQL 16.15) + Live Gemini gemini-embedding-2 API',
    timestamp: new Date().toISOString(),
    summary: stats,
    dbVerification: dbVerify.rows[0],
    queries: results,
  };

  const outPath = path.resolve(process.cwd(), '../benchmarks/results/retrieval-local-60.json');
  await fs.writeFile(outPath, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`\nSaved raw results to: ${outPath}`);
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

