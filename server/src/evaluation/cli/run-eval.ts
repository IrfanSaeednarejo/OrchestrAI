// src/evaluation/cli/run-eval.ts
// Phase 15: Standalone CLI benchmark runner.
// Executes the 30 canonical evaluation scenarios, prints an ASCII scorecard,
// and saves a markdown benchmark report to eval-results.md.

import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { EVALUATION_SCENARIOS } from '../dataset/scenarios.js';
import { runBenchmark } from '../runner/eval-runner.js';
import type { BenchmarkReport } from '../runner/eval-runner.js';

function formatPercentage(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

function generateMarkdownReport(report: BenchmarkReport): string {
  const timestamp = new Date().toISOString();
  let md = `# OrchestrAI Evaluation Benchmark Report\n\n`;
  md += `**Generated**: ${timestamp}  \n`;
  md += `**Total Scenarios**: ${report.totalScenarios}  \n`;
  md += `**Passed Scenarios**: ${report.passedScenarios}  \n`;
  md += `**Overall Pass Rate**: ${formatPercentage(report.passRate)}\n\n`;

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

export async function main(): Promise<void> {
  console.log('='.repeat(70));
  console.log('  OrchestrAI Evaluation Framework — 30 Scenario Benchmark');
  console.log('='.repeat(70));
  console.log(`Loaded ${EVALUATION_SCENARIOS.length} canonical scenarios.\n`);

  const report = await runBenchmark(EVALUATION_SCENARIOS, {
    configurable: {
      useStubs: true,
      stubBehavior: {
        type: 'COMPLETE',
        message: 'Evaluation automated stub response processed.',
      },
    },
  });

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

  if (report.passRate < 1.0) {
    process.exitCode = 1;
  }
}

// Direct CLI invocation
if (import.meta.url.startsWith('file:') && process.argv[1]?.endsWith('run-eval.ts')) {
  main().catch((err) => {
    console.error('Benchmark execution error:', err);
    process.exit(1);
  });
}

