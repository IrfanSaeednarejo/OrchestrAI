#!/usr/bin/env tsx
/**
 * scripts/report-metrics.ts
 * Phase 26: Prints instrumentation metrics from the database.
 *
 * Usage:
 *   npx tsx scripts/report-metrics.ts
 *   # With cost reporting (optional env vars must be set):
 *   GEMINI_INPUT_PRICE_PER_MTOK=0.075 GEMINI_OUTPUT_PRICE_PER_MTOK=0.30 npx tsx scripts/report-metrics.ts
 *
 * Reads: tool_executions, agent_executions, retrieval_executions, llm_calls,
 *        routing_history, messages (metadata jsonb)
 */

import 'dotenv/config';
import { db } from '../src/persistence/db/client.js';
import { sql } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(n: number | null | undefined, unit = 'ms'): string {
  if (n === null || n === undefined) return 'N/A';
  return `${Math.round(n)}${unit}`;
}

function fmtPct(n: number | null | undefined): string {
  if (n === null || n === undefined) return 'N/A';
  return `${(n * 100).toFixed(1)}%`;
}

function header(title: string) {
  const line = '─'.repeat(60);
  console.log(`\n${line}`);
  console.log(`  ${title}`);
  console.log(line);
}

// ---------------------------------------------------------------------------
// 1. Tool execution latency: p50 / p95 per tool (status='success' only)
// ---------------------------------------------------------------------------

async function reportToolLatency() {
  header('Tool Execution Latency (status=success)');

  const rows = await db.execute<{
    tool: string;
    n: string;
    p50: string | null;
    p95: string | null;
  }>(sql`
    SELECT
      tool,
      COUNT(*)::text          AS n,
      PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY duration) AS p50,
      PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration) AS p95
    FROM tool_executions
    WHERE status = 'success'
    GROUP BY tool
    ORDER BY tool
  `);

  if (rows.rows.length === 0) {
    console.log('  (no successful tool executions recorded)');
    return;
  }

  console.log(
    `  ${'Tool'.padEnd(35)} ${'n'.padStart(6)} ${'p50'.padStart(8)} ${'p95'.padStart(8)}`
  );
  console.log('  ' + '-'.repeat(57));
  for (const r of rows.rows) {
    console.log(
      `  ${r.tool.padEnd(35)} ${String(r.n).padStart(6)} ` +
        `${fmt(r.p50 ? Number(r.p50) : null).padStart(8)} ` +
        `${fmt(r.p95 ? Number(r.p95) : null).padStart(8)}`
    );
  }
}

// ---------------------------------------------------------------------------
// 2. Agent execution latency: p50 / p95 per agent
// ---------------------------------------------------------------------------

async function reportAgentLatency() {
  header('Agent Execution Latency');

  const rows = await db.execute<{
    agent: string;
    status: string;
    n: string;
    p50: string | null;
    p95: string | null;
  }>(sql`
    SELECT
      agent,
      status,
      COUNT(*)::text          AS n,
      PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY duration) AS p50,
      PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration) AS p95
    FROM agent_executions
    WHERE duration IS NOT NULL
    GROUP BY agent, status
    ORDER BY agent, status
  `);

  if (rows.rows.length === 0) {
    console.log('  (no agent executions with duration recorded)');
    return;
  }

  console.log(
    `  ${'Agent'.padEnd(22)} ${'Status'.padEnd(10)} ${'n'.padStart(6)} ${'p50'.padStart(8)} ${'p95'.padStart(8)}`
  );
  console.log('  ' + '-'.repeat(54));
  for (const r of rows.rows) {
    console.log(
      `  ${r.agent.padEnd(22)} ${r.status.padEnd(10)} ${String(r.n).padStart(6)} ` +
        `${fmt(r.p50 ? Number(r.p50) : null).padStart(8)} ` +
        `${fmt(r.p95 ? Number(r.p95) : null).padStart(8)}`
    );
  }
}

// ---------------------------------------------------------------------------
// 3. Retrieval timing: embed_ms / search_ms per domain+topic
// ---------------------------------------------------------------------------

async function reportRetrievalLatency() {
  header('Retrieval Timing (embed_ms / search_ms)');

  const rows = await db.execute<{
    domain: string;
    topic: string;
    n: string;
    avg_embed: string | null;
    avg_search: string | null;
    avg_results: string | null;
    avg_top_sim: string | null;
  }>(sql`
    SELECT
      domain,
      topic,
      COUNT(*)::text               AS n,
      AVG(embed_ms)                AS avg_embed,
      AVG(search_ms)               AS avg_search,
      AVG(result_count)            AS avg_results,
      AVG(top_similarity)          AS avg_top_sim
    FROM retrieval_executions
    GROUP BY domain, topic
    ORDER BY domain, topic
  `);

  if (rows.rows.length === 0) {
    console.log('  (no retrieval executions recorded)');
    return;
  }

  console.log(
    `  ${'Domain'.padEnd(14)} ${'Topic'.padEnd(18)} ${'n'.padStart(5)} ` +
      `${'embed'.padStart(8)} ${'search'.padStart(8)} ${'results'.padStart(8)} ${'top_sim'.padStart(8)}`
  );
  console.log('  ' + '-'.repeat(69));
  for (const r of rows.rows) {
    console.log(
      `  ${(r.domain ?? '').padEnd(14)} ${(r.topic ?? '(none)').padEnd(18)} ${String(r.n).padStart(5)} ` +
        `${fmt(r.avg_embed ? Number(r.avg_embed) : null).padStart(8)} ` +
        `${fmt(r.avg_search ? Number(r.avg_search) : null).padStart(8)} ` +
        `${r.avg_results ? Number(r.avg_results).toFixed(1) : 'N/A'.padStart(8)} ` +
        `${r.avg_top_sim ? Number(r.avg_top_sim).toFixed(3) : 'N/A'}`
    );
  }
}

// ---------------------------------------------------------------------------
// 4. LLM calls: per-node token averages (and cost if prices configured)
// ---------------------------------------------------------------------------

async function reportLLMUsage() {
  const inputPrice = parseFloat(process.env['GEMINI_INPUT_PRICE_PER_MTOK'] ?? '');
  const outputPrice = parseFloat(process.env['GEMINI_OUTPUT_PRICE_PER_MTOK'] ?? '');
  const hasPrices = !isNaN(inputPrice) && !isNaN(outputPrice);

  header(`LLM Calls per Node${hasPrices ? ' (with cost)' : ''}`);

  const rows = await db.execute<{
    node: string;
    n: string;
    avg_prompt: string | null;
    avg_output: string | null;
    avg_total: string | null;
    avg_duration: string | null;
    total_prompt: string | null;
    total_output: string | null;
  }>(sql`
    SELECT
      node,
      COUNT(*)::text               AS n,
      AVG(prompt_tokens)           AS avg_prompt,
      AVG(output_tokens)           AS avg_output,
      AVG(total_tokens)            AS avg_total,
      AVG(duration_ms)             AS avg_duration,
      SUM(prompt_tokens)::text     AS total_prompt,
      SUM(output_tokens)::text     AS total_output
    FROM llm_calls
    GROUP BY node
    ORDER BY node
  `);

  if (rows.rows.length === 0) {
    console.log('  (no LLM calls recorded)');
    return;
  }

  const header2 =
    `  ${'Node'.padEnd(22)} ${'n'.padStart(5)} ${'avg_in'.padStart(8)} ` +
    `${'avg_out'.padStart(8)} ${'avg_ms'.padStart(8)}` +
    (hasPrices ? ` ${'cost($)'.padStart(10)}` : '');
  console.log(header2);
  console.log('  ' + '-'.repeat(hasPrices ? 73 : 63));

  for (const r of rows.rows) {
    const cost =
      hasPrices && r.total_prompt && r.total_output
        ? (
            (Number(r.total_prompt) * inputPrice) / 1_000_000 +
            (Number(r.total_output) * outputPrice) / 1_000_000
          ).toFixed(6)
        : null;

    console.log(
      `  ${r.node.padEnd(22)} ${String(r.n).padStart(5)} ` +
        `${r.avg_prompt ? Math.round(Number(r.avg_prompt)).toString() : 'N/A'.padStart(8)} ` +
        `${r.avg_output ? Math.round(Number(r.avg_output)).toString() : 'N/A'.padStart(8)} ` +
        `${fmt(r.avg_duration ? Number(r.avg_duration) : null).padStart(8)}` +
        (hasPrices ? `  $${cost ?? 'N/A'}` : '')
    );
  }

  // Per-conversation cost (only if prices set)
  if (hasPrices) {
    const costRows = await db.execute<{
      conversation_id: string;
      cost: string;
    }>(sql`
      SELECT
        conversation_id,
        (SUM(COALESCE(prompt_tokens,0)) * ${inputPrice} / 1000000.0 +
         SUM(COALESCE(output_tokens,0)) * ${outputPrice} / 1000000.0)::text AS cost
      FROM llm_calls
      WHERE conversation_id IS NOT NULL
      GROUP BY conversation_id
      ORDER BY cost DESC
      LIMIT 20
    `);

    if (costRows.rows.length > 0) {
      console.log('\n  Top conversations by LLM cost:');
      console.log(`  ${'conversation_id'.padEnd(38)} ${'cost($)'.padStart(12)}`);
      for (const r of costRows.rows) {
        console.log(`  ${r.conversation_id.padEnd(38)} $${Number(r.cost).toFixed(6)}`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 5. Routing path distribution
// ---------------------------------------------------------------------------

async function reportRoutingPaths() {
  header('Routing Path Distribution');

  const rows = await db.execute<{
    routing_path: string | null;
    n: string;
  }>(sql`
    SELECT
      COALESCE(routing_path, '(null)') AS routing_path,
      COUNT(*)::text                   AS n
    FROM routing_history
    GROUP BY routing_path
    ORDER BY COUNT(*) DESC
  `);

  if (rows.rows.length === 0) {
    console.log('  (no routing history recorded)');
    return;
  }

  const total = rows.rows.reduce((s, r) => s + Number(r.n), 0);
  const fastTotal = rows.rows
    .filter((r) => r.routing_path?.startsWith('fast:'))
    .reduce((s, r) => s + Number(r.n), 0);

  console.log(`  ${'routing_path'.padEnd(28)} ${'n'.padStart(6)} ${'share'.padStart(8)}`);
  console.log('  ' + '-'.repeat(42));
  for (const r of rows.rows) {
    const pct = (Number(r.n) / total) * 100;
    console.log(
      `  ${(r.routing_path ?? '').padEnd(28)} ${String(r.n).padStart(6)} ${pct.toFixed(1).padStart(7)}%`
    );
  }
  console.log(`\n  Total decisions: ${total}`);
  console.log(
    `  fast:* decisions: ${fastTotal} (${((fastTotal / total) * 100).toFixed(1)}%)`
  );
  console.log(
    `  LLM decisions:   ${total - fastTotal} (${(((total - fastTotal) / total) * 100).toFixed(1)}%)`
  );
}

// ---------------------------------------------------------------------------
// 6. Turn timing: p50 / p95 from messages.metadata->>'turnMs'
// ---------------------------------------------------------------------------

async function reportTurnTiming() {
  header('Turn Wall-Time (turnMs from message metadata)');

  const rows = await db.execute<{
    n: string;
    p50: string | null;
    p95: string | null;
    min: string | null;
    max: string | null;
  }>(sql`
    SELECT
      COUNT(*)::text                                             AS n,
      PERCENTILE_CONT(0.50) WITHIN GROUP (
        ORDER BY (metadata->>'turnMs')::numeric
      )                                                         AS p50,
      PERCENTILE_CONT(0.95) WITHIN GROUP (
        ORDER BY (metadata->>'turnMs')::numeric
      )                                                         AS p95,
      MIN((metadata->>'turnMs')::numeric)                       AS min,
      MAX((metadata->>'turnMs')::numeric)                       AS max
    FROM messages
    WHERE role = 'assistant'
      AND metadata ? 'turnMs'
      AND (metadata->>'turnMs') IS NOT NULL
  `);

  const r = rows.rows[0];
  if (!r || r.n === '0') {
    console.log('  (no assistant messages with turnMs recorded yet)');
    return;
  }

  console.log(`  Turns recorded : ${r.n}`);
  console.log(`  p50            : ${fmt(r.p50 ? Number(r.p50) : null)}`);
  console.log(`  p95            : ${fmt(r.p95 ? Number(r.p95) : null)}`);
  console.log(`  min            : ${fmt(r.min ? Number(r.min) : null)}`);
  console.log(`  max            : ${fmt(r.max ? Number(r.max) : null)}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║          OrchestrAI — Instrumentation Report             ║');
  console.log(`║  Generated: ${new Date().toISOString()}      ║`);
  console.log('╚══════════════════════════════════════════════════════════╝');

  await reportToolLatency();
  await reportAgentLatency();
  await reportRetrievalLatency();
  await reportLLMUsage();
  await reportRoutingPaths();
  await reportTurnTiming();

  console.log('\n');
  process.exit(0);
}

main().catch((err) => {
  console.error('report-metrics error:', err);
  process.exit(1);
});

