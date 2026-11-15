// src/evaluation/cli/run-eval.ts
// Phase 15: Standalone CLI benchmark runner.
// Executes the 30 canonical evaluation scenarios (v1 or v2), prints an ASCII scorecard,
// records latency metrics, and saves raw JSON to benchmarks/results/ and markdown to eval-results.md.

import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { EVALUATION_SCENARIOS } from '../dataset/scenarios.js';
import { EVALUATION_SCENARIOS_V2 } from '../dataset/scenarios-v2.js';
import { runBenchmark, type RunScenarioOptions, type BenchmarkReport } from '../runner/eval-runner.js';

function formatPercentage(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

function generateMarkdownReport(report: BenchmarkReport): string {
  const timestamp = report.timestamp || new Date().toISOString();
  let md = `# OrchestrAI Evaluation Benchmark Report\n\n`;
  md += `**Generated**: ${timestamp}  \n`;
  md += `**Run ID**: ${report.evalRunId ?? 'N/A'}  \n`;
  md += `**Dataset Version**: ${report.datasetVersion ?? 'v1'}  \n`;
  md += `**Checkpointer**: ${report.checkpointerType}  \n`;
  md += `**Total Scenarios**: ${report.totalScenarios}  \n`;
  md += `**Passed Scenarios**: ${report.passedScenarios}  \n`;
  md += `**Overall Pass Rate**: ${formatPercentage(report.passRate)}\n\n`;

  if (report.timingSummary) {
    const t = report.timingSummary;
    md += `## 0. Latency & Query Decomposition\n\n`;
    md += `| Scope | Turns (N) | Turn ms (p50/p95/mean) | DB ms (p50/p95/mean) | Mean DB Queries | Mean LLM ms | Mean Other ms |\n`;
    md += `|---|---:|---:|---:|---:|---:|---:|\n`;
    md += `| Overall | ${t.overall.count} | ${t.overall.turnMsP50} / ${t.overall.turnMsP95} / ${t.overall.turnMsMean} | ${t.overall.dbMsP50} / ${t.overall.dbMsP95} / ${t.overall.dbMsMean} | ${t.overall.meanQueries} | ${t.overall.meanLlmMs} | ${t.overall.meanOtherMs} |\n`;
    md += `| Turn 1 | ${t.turn1.count} | ${t.turn1.turnMsP50} / ${t.turn1.turnMsP95} / ${t.turn1.turnMsMean} | ${t.turn1.dbMsP50} / ${t.turn1.dbMsP95} / ${t.turn1.dbMsMean} | ${t.turn1.meanQueries} | ${t.turn1.meanLlmMs} | ${t.turn1.meanOtherMs} |\n`;
    md += `| Later Turns | ${t.laterTurns.count} | ${t.laterTurns.turnMsP50} / ${t.laterTurns.turnMsP95} / ${t.laterTurns.turnMsMean} | ${t.laterTurns.dbMsP50} / ${t.laterTurns.dbMsP95} / ${t.laterTurns.dbMsMean} | ${t.laterTurns.meanQueries} | ${t.laterTurns.meanLlmMs} | ${t.laterTurns.meanOtherMs} |\n\n`;

    if (t.topQuerySources.length > 0) {
      md += `### Top DB Query Sources\n\n`;
      md += `| Source File | Query Count | Total DB ms |\n`;
      md += `|---|---:|---:|\n`;
      for (const s of t.topQuerySources.slice(0, 5)) {
        md += `| \`${s.source}\` | ${s.count} | ${s.totalMs} |\n`;
      }
      md += `\n`;
    }
  }

  md += `## 1. Domain Performance\n\n`;
  md += `| Domain | Total Scenarios | Passed | Pass Rate |\n`;
  md += `|---|---:|---:|---:|\n`;
  for (const [domain, stats] of Object.entries(report.byDomain)) {
    md += `| ${domain} | ${stats.total} | ${stats.passed} | ${formatPercentage(stats.rate)} |\n`;
  }
  md += `\n`;

  md += `## 2. Evaluator Performance\n\n`;
  md += `| Evaluator | Total Checks | Passed | Pass Rate |\n`;
  md += `|---|---:|---:|---:|\n`;
  for (const [evaluator, stats] of Object.entries(report.byEvaluator)) {
    md += `| ${evaluator} | ${stats.total} | ${stats.passed} | ${formatPercentage(stats.rate)} |\n`;
  }
  md += `\n`;

  md += `## 3. Scenario Details\n\n`;
  md += `| ID | Scenario Name | Domain | Pattern | Turns | Result |\n`;
  md += `|---|---|---|---|---:|:---:|\n`;
  for (const res of report.scenarioResults) {
    const statusBadge = res.scenarioPassed ? '✅ PASS' : '❌ FAIL';
    md += `| ${res.scenario.id} | ${res.scenario.name} | ${res.scenario.domain} | ${res.scenario.pattern} | ${res.scenario.turns.length} | ${statusBadge} |\n`;
  }
  md += `\n`;

  return md;
}

export async function main(): Promise<BenchmarkReport> {
  const args = process.argv.slice(2);
  const datasetArg =
    args.find((a) => a.startsWith('--dataset='))?.split('=')[1] ??
    process.env.EVAL_DATASET ??
    'v1';
  const runIdArg =
    args.find((a) => a.startsWith('--run-id='))?.split('=')[1] ??
    process.env.EVAL_RUN_ID ??
    `run-${Date.now()}`;
  const usePostgres =
    args.includes('--use-postgres') || process.env.EVAL_USE_POSTGRES === 'true';
  const outputArg =
    args.find((a) => a.startsWith('--output='))?.split('=')[1] ??
    process.env.EVAL_OUTPUT_JSON;
  const isLive = process.env.EVAL_LIVE === 'true';
  const pacingArg =
    args.find((a) => a.startsWith('--pacing='))?.split('=')[1] ??
    process.env.EVAL_PACING_MS;
  const pacingMs = pacingArg ? parseInt(pacingArg, 10) : (isLive ? 4500 : 0);

  const scenarios = datasetArg === 'v2' ? EVALUATION_SCENARIOS_V2 : EVALUATION_SCENARIOS;

  console.log('='.repeat(70));
  console.log(`  OrchestrAI Evaluation Framework — 30 Scenario Benchmark (${datasetArg.toUpperCase()})`);
  console.log('='.repeat(70));
  console.log(`Dataset Version   : ${datasetArg}`);
  console.log(`Run ID            : ${runIdArg}`);
  console.log(`Checkpointer      : ${usePostgres ? 'PostgresSaver (Real DB)' : 'MemorySaver'}`);
  console.log(`Pacing Interval   : ${pacingMs}ms per turn`);
  console.log(`Loaded Scenarios  : ${scenarios.length}\n`);

  console.log(`Execution Mode: ${isLive ? 'LIVE (Real Gemini API + Full Specialists)' : 'MOCKED (Stubbed Specialists)'}\n`);

  const benchmarkOptions: RunScenarioOptions = {
    evalRunId: runIdArg,
    datasetVersion: datasetArg,
    usePostgresCheckpointer: usePostgres,
    pacingMs,
    ...(isLive
      ? {}
      : {
          configurable: {
            useStubs: true,
            stubBehavior: {
              type: 'COMPLETE',
              message: 'Evaluation automated stub response processed.',
            },
          },
        }),
  };

  const report = await runBenchmark(scenarios, benchmarkOptions);

  console.log('--- Domain Breakdown ---');
  for (const [domain, stats] of Object.entries(report.byDomain)) {
    console.log(
      `  [${domain.padEnd(14)}] ${stats.passed}/${stats.total} passed (${formatPercentage(stats.rate)})`
    );
  }

  console.log('\n--- Evaluator Breakdown ---');
  for (const [evaluator, stats] of Object.entries(report.byEvaluator)) {
    console.log(
      `  [${evaluator.padEnd(25)}] ${stats.passed}/${stats.total} passed (${formatPercentage(stats.rate)})`
    );
  }

  if (report.timingSummary) {
    const t = report.timingSummary;
    console.log('\n--- Latency & Query Decomposition ---');
    console.log(`  Overall Turns     : ${t.overall.count}`);
    console.log(`  Turn ms (p50/p95) : ${t.overall.turnMsP50}ms / ${t.overall.turnMsP95}ms (mean: ${t.overall.turnMsMean}ms)`);
    console.log(`  DB ms (p50/p95)   : ${t.overall.dbMsP50}ms / ${t.overall.dbMsP95}ms (mean: ${t.overall.dbMsMean}ms)`);
    console.log(`  Mean Queries/Turn : ${t.overall.meanQueries}`);
    console.log(`  Mean LLM ms/Turn  : ${t.overall.meanLlmMs}ms`);
    console.log(`  Mean Other ms/Turn: ${t.overall.meanOtherMs}ms`);
    console.log(`  Turn 1 ms (p50/p95): ${t.turn1.turnMsP50}ms / ${t.turn1.turnMsP95}ms (mean DB ms: ${t.turn1.dbMsMean}ms, queries: ${t.turn1.meanQueries})`);
    console.log(`  Later Turn (p50/95): ${t.laterTurns.turnMsP50}ms / ${t.laterTurns.turnMsP95}ms (mean DB ms: ${t.laterTurns.dbMsMean}ms, queries: ${t.laterTurns.meanQueries})`);

    if (t.topQuerySources.length > 0) {
      console.log('\n--- Top 3 DB Query Sources ---');
      for (const s of t.topQuerySources.slice(0, 3)) {
        console.log(`  [${s.source}] ${s.count} queries, ${s.totalMs}ms total`);
      }
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log(
    `OVERALL: ${report.passedScenarios}/${report.totalScenarios} scenarios passed (${formatPercentage(report.passRate)})`
  );
  console.log('='.repeat(70) + '\n');

  // Save markdown scorecard
  const reportPath = path.resolve(process.cwd(), 'eval-results.md');
  const markdown = generateMarkdownReport(report);
  await fs.writeFile(reportPath, markdown, 'utf-8');
  console.log(`Benchmark scorecard written to: ${reportPath}`);

  if (outputArg) {
    const jsonPath = path.resolve(process.cwd(), outputArg);
    await fs.mkdir(path.dirname(jsonPath), { recursive: true });
    await fs.writeFile(jsonPath, JSON.stringify(report, null, 2), 'utf-8');
    console.log(`Benchmark raw JSON written to: ${jsonPath}`);
  }

  if (report.passRate < 1.0) {
    process.exitCode = 1;
  }

  return report;
}

// Direct CLI invocation
if (import.meta.url.startsWith('file:') && process.argv[1]?.endsWith('run-eval.ts')) {
  main().catch((err) => {
    console.error('Benchmark execution error:', err);
    process.exit(1);
  });
}
