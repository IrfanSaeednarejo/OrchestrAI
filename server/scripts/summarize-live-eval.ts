// scripts/summarize-live-eval.ts
import fs from 'node:fs/promises';
import path from 'node:path';

async function main() {
  const run1 = JSON.parse(await fs.readFile('../benchmarks/results/live-eval-run-1.json', 'utf-8'));
  const run2 = JSON.parse(await fs.readFile('../benchmarks/results/live-eval-run-2.json', 'utf-8'));
  const run3 = JSON.parse(await fs.readFile('../benchmarks/results/live-eval-run-3.json', 'utf-8'));
  const mocked = JSON.parse(await fs.readFile('../benchmarks/results/mocked-eval-results.json', 'utf-8'));

  const evaluators = Object.keys(run1.byEvaluator);

  const evaluatorStats: Record<string, { run1: number; run2: number; run3: number; mean: number; variance: number; stdDev: number; mocked: number }> = {};

  for (const ev of evaluators) {
    const r1 = run1.byEvaluator[ev].rate;
    const r2 = run2.byEvaluator[ev].rate;
    const r3 = run3.byEvaluator[ev].rate;
    const mean = (r1 + r2 + r3) / 3;
    const variance = ((r1 - mean) ** 2 + (r2 - mean) ** 2 + (r3 - mean) ** 2) / 3;
    const stdDev = Math.sqrt(variance);
    const m = mocked.byEvaluator[ev]?.rate ?? 0;

    evaluatorStats[ev] = {
      run1: Math.round(r1 * 1000) / 10,
      run2: Math.round(r2 * 1000) / 10,
      run3: Math.round(r3 * 1000) / 10,
      mean: Math.round(mean * 1000) / 10,
      variance: Number(variance.toFixed(6)),
      stdDev: Math.round(stdDev * 1000) / 10,
      mocked: Math.round(m * 1000) / 10,
    };
  }

  // Find scenarios that failed in ANY run
  const allScenarioIds = new Set<string>();
  run1.scenarioResults.forEach((s: any) => allScenarioIds.add(s.scenario.id));

  const failingScenarios: Record<string, { name: string; run1Passed: boolean; run2Passed: boolean; run3Passed: boolean }> = {};
  for (const id of allScenarioIds) {
    const s1 = run1.scenarioResults.find((s: any) => s.scenario.id === id);
    const s2 = run2.scenarioResults.find((s: any) => s.scenario.id === id);
    const s3 = run3.scenarioResults.find((s: any) => s.scenario.id === id);

    const p1 = s1?.scenarioPassed ?? false;
    const p2 = s2?.scenarioPassed ?? false;
    const p3 = s3?.scenarioPassed ?? false;

    if (!p1 || !p2 || !p3) {
      failingScenarios[id] = {
        name: s1?.scenario.name ?? '',
        run1Passed: p1,
        run2Passed: p2,
        run3Passed: p3,
      };
    }
  }

  const summary = {
    metadata: {
      generatedAt: new Date().toISOString(),
      scenarioCount: 30,
      runs: 3,
      dataSource: 'live model (gemini-3.5-flash-lite) vs mocked model',
    },
    overallPassRate: {
      run1: run1.passRate,
      run2: run2.passRate,
      run3: run3.passRate,
      mean: (run1.passRate + run2.passRate + run3.passRate) / 3,
      mocked: mocked.passRate,
    },
    evaluatorStats,
    failingScenariosCount: Object.keys(failingScenarios).length,
    failingScenarios,
  };

  const outPath = path.resolve('../benchmarks/results/live-eval-summary.json');
  await fs.writeFile(outPath, JSON.stringify(summary, null, 2), 'utf-8');
  console.log('Saved summary to', outPath);
}

main().catch(console.error);

