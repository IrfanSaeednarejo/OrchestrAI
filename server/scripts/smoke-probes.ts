/**
 * Production smoke probes — Phase D.
 *
 * Runs the 6 positive + 2 negative probes from eval/production-smoke.md
 * against whatever DATABASE_URL is loaded from server/.env at invocation.
 * Exits 0 iff all 8 probes pass.
 *
 * Usage:  cd server && npx tsx scripts/smoke-probes.ts
 */
import 'dotenv/config';
import { retrieveKnowledge } from '../src/knowledge/retrieval.js';

type Probe = {
  id: string;
  query: string;
  domains: ('orders' | 'payments' | 'account')[];
  topics: string[];
  expectedTop?: string;
};

const probes: Probe[] = [
  { id: 'P1', query: 'How many days do I have to return an item after delivery?', domains: ['orders'], topics: ['returns'], expectedTop: 'Return Eligibility' },
  { id: 'P2', query: 'What are the rules and exceptions for damaged or defective items?', domains: ['orders'], topics: ['returns'], expectedTop: 'Return Eligibility' },
  { id: 'P3', query: 'What does shipment status in transit or delivered mean?', domains: ['orders'], topics: ['shipping'], expectedTop: 'What do the different shipment statuses mean?' },
  { id: 'P4', query: 'When will a refund show up on my credit card statement?', domains: ['payments'], topics: ['refunds'], expectedTop: 'When Refunds Are Issued' },
  { id: 'P5', query: 'What does payment status settled or failed mean?', domains: ['payments'], topics: ['payments'], expectedTop: 'What do the different payment statuses mean?' },
  { id: 'P6', query: 'How does two-factor authentication and OTP verification work for login security?', domains: ['account'], topics: ['account_security'], expectedTop: 'How does the verification code process work?' },
  { id: 'N1', query: 'How many days do I have to return an item after delivery?', domains: ['payments'], topics: ['returns'] },
  { id: 'N2', query: 'What is the pet policy for retail store visits?', domains: ['orders'], topics: ['pet_policy_nonexistent'] },
];

console.log(`Running ${probes.length} smoke probes...\n`);

let fails = 0;
let inconclusive = 0;
const times: number[] = [];

for (const p of probes) {
  const t0 = performance.now();
  let result;
  try {
    result = await retrieveKnowledge({ query: p.query, domains: p.domains, topics: p.topics, topK: 3 });
  } catch (e) {
    console.log(`${p.id} | THREW | ${e instanceof Error ? e.message : String(e)}`);
    inconclusive++;
    continue;
  }
  const ms = Math.round(performance.now() - t0);
  times.push(ms);
  if (!result.success) {
    console.log(`${p.id} | ${ms}ms | INCONCLUSIVE | error=${JSON.stringify(result.error)}`);
    inconclusive++;
    continue;
  }
  const hits = result.data ?? [];
  const top = hits[0]?.sectionPath ?? 'NONE';
  let verdict: 'PASS' | 'FAIL';
  if (p.expectedTop) verdict = top === p.expectedTop ? 'PASS' : 'FAIL';
  else verdict = hits.length === 0 ? 'PASS' : 'FAIL';
  if (verdict === 'FAIL') fails++;
  console.log(`${p.id} | ${ms}ms | hits=${hits.length} | top=${top} | verdict=${verdict} | expected=${p.expectedTop ?? '0_hits'}`);
  for (let i = 0; i < hits.length; i++) {
    const h = hits[i];
    const rrf = typeof h.relevanceScore === 'number' ? h.relevanceScore.toFixed(4) : 'N/A';
    const sim = typeof h.similarity === 'number' ? h.similarity.toFixed(4) : 'N/A';
    console.log(`    [${i}] ${h.sectionPath} | rrf=${rrf} | sim=${sim}`);
  }
  await new Promise(r => setTimeout(r, 500));
}

console.log(`\n=== SUMMARY ===`);
const pass = probes.length - fails - inconclusive;
console.log(`PASS: ${pass} | FAIL: ${fails} | INCONCLUSIVE: ${inconclusive} | TOTAL: ${probes.length}`);
if (times.length > 0) {
  times.sort((a, b) => a - b);
  const pct = (n: number) => times[Math.min(times.length - 1, Math.floor(n * times.length))];
  console.log(`LATENCY: min=${times[0]}ms p50=${pct(0.5)}ms p95=${pct(0.95)}ms max=${times[times.length - 1]}ms`);
}
process.exit(fails > 0 || inconclusive > 0 ? 1 : 0);
