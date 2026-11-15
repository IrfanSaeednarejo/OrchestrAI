// scripts/compile-final-report.ts
// Compiles benchmark and evaluation results into benchmarks/results/final-evaluation-report.json

import fs from 'node:fs/promises';
import path from 'node:path';

const RESULTS_DIR = path.resolve(process.cwd(), '../benchmarks/results');

async function readJsonSafely(filename: string) {
  try {
    const raw = await fs.readFile(path.join(RESULTS_DIR, filename), 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function fmt(n: number | null | undefined, unit = 'ms'): string {
  if (n === null || n === undefined) return 'N/A';
  return `${Math.round(n)}${unit}`;
}

async function main() {
  const mockedV1 = await readJsonSafely('mocked-eval-v1.json');
  const mockedV2 = await readJsonSafely('mocked-eval-v2.json');
  const liveV1Run1 = await readJsonSafely('live-eval-v1-run1.json');
  const liveV1Run2 = await readJsonSafely('live-eval-v1-run2.json');
  const liveV1Run3 = await readJsonSafely('live-eval-v1-run3.json');
  const liveV2Run1 = await readJsonSafely('live-eval-v2-run1.json');
  const liveV2Run2 = await readJsonSafely('live-eval-v2-run2.json');
  const liveV2Run3 = await readJsonSafely('live-eval-v2-run3.json');
  const localRun1 = await readJsonSafely('local-docker-run1.json');
  const localRun2 = await readJsonSafely('local-docker-run2.json');
  const localRun3 = await readJsonSafely('local-docker-run3.json');

  console.log('=== Status of Benchmark Files ===');
  console.log('mocked-eval-v1.json:', Boolean(mockedV1));
  console.log('mocked-eval-v2.json:', Boolean(mockedV2));
  console.log('live-eval-v1-run1.json:', Boolean(liveV1Run1));
  console.log('live-eval-v1-run2.json:', Boolean(liveV1Run2));
  console.log('live-eval-v1-run3.json:', Boolean(liveV1Run3));
  console.log('live-eval-v2-run1.json:', Boolean(liveV2Run1));
  console.log('live-eval-v2-run2.json:', Boolean(liveV2Run2));
  console.log('live-eval-v2-run3.json:', Boolean(liveV2Run3));
  console.log('local-docker-run1.json:', Boolean(localRun1));
  console.log('local-docker-run2.json:', Boolean(localRun2));
  console.log('local-docker-run3.json:', Boolean(localRun3));

  const liveV1Runs = [liveV1Run1, liveV1Run2, liveV1Run3].filter(Boolean);
  const liveV2Runs = [liveV2Run1, liveV2Run2, liveV2Run3].filter(Boolean);
  const localRuns = [localRun1, localRun2, localRun3].filter(Boolean);

  const evaluators = [
    'ROUTING_CORRECT',
    'HANDOFF_CORRECT',
    'SPECIALIST_SCOPE_CORRECT',
    'TOOL_SELECTION_CORRECT',
    'STATE_PRESERVED',
    'KNOWLEDGE_GROUNDED',
    'WORKFLOW_COMPLETED',
    'RESOLUTION_CORRECT',
  ];

  const report = {
    timestamp: new Date().toISOString(),
    evaluatorSummary: {} as Record<string, any>,
    latencySummary: {} as Record<string, any>,
  };

  // Evaluator comparison
  for (const ev of evaluators) {
    const v1Rates = liveV1Runs.map(r => r.byEvaluator[ev]?.rate ?? 0);
    const v2Rates = liveV2Runs.map(r => r.byEvaluator[ev]?.rate ?? 0);
    const v1Mean = v1Rates.length ? v1Rates.reduce((s, x) => s + x, 0) / v1Rates.length : 0;
    const v2Mean = v2Rates.length ? v2Rates.reduce((s, x) => s + x, 0) / v2Rates.length : 0;
    report.evaluatorSummary[ev] = {
      mockedV1: mockedV1?.byEvaluator[ev]?.rate ?? null,
      mockedV2: mockedV2?.byEvaluator[ev]?.rate ?? null,
      liveV1Runs: v1Rates,
      liveV1Mean: v1Mean,
      liveV2Runs: v2Rates,
      liveV2Mean: v2Mean,
      diff: v2Mean - v1Mean,
    };
  }

  // Latency comparison: Neon vs Local Docker
  if (liveV2Runs.length > 0 && localRuns.length > 0) {
    report.latencySummary = {
      neon: {
        turnsTotal: liveV2Runs.reduce((s, r) => s + (r.timingSummary?.overall.count ?? 0), 0),
        overallTurnMsP50: liveV2Runs[0]?.timingSummary?.overall.turnMsP50,
        overallTurnMsP95: liveV2Runs[0]?.timingSummary?.overall.turnMsP95,
        meanQueries: liveV2Runs[0]?.timingSummary?.overall.meanQueries,
        meanDbMs: liveV2Runs[0]?.timingSummary?.overall.dbMsMean,
        meanLlmMs: liveV2Runs[0]?.timingSummary?.overall.meanLlmMs,
        meanOtherMs: liveV2Runs[0]?.timingSummary?.overall.meanOtherMs,
        turn1P50: liveV2Runs[0]?.timingSummary?.turn1.turnMsP50,
        turn1P95: liveV2Runs[0]?.timingSummary?.turn1.turnMsP95,
        turn1MeanDbMs: liveV2Runs[0]?.timingSummary?.turn1.dbMsMean,
        turn1MeanQueries: liveV2Runs[0]?.timingSummary?.turn1.meanQueries,
        laterTurnsP50: liveV2Runs[0]?.timingSummary?.laterTurns.turnMsP50,
        laterTurnsP95: liveV2Runs[0]?.timingSummary?.laterTurns.turnMsP95,
        laterTurnsMeanDbMs: liveV2Runs[0]?.timingSummary?.laterTurns.dbMsMean,
        laterTurnsMeanQueries: liveV2Runs[0]?.timingSummary?.laterTurns.meanQueries,
        topQuerySources: liveV2Runs[0]?.timingSummary?.topQuerySources?.slice(0, 3),
      },
      localDocker: {
        turnsTotal: localRuns.reduce((s, r) => s + (r.timingSummary?.overall.count ?? 0), 0),
        overallTurnMsP50: localRuns[0]?.timingSummary?.overall.turnMsP50,
        overallTurnMsP95: localRuns[0]?.timingSummary?.overall.turnMsP95,
        meanQueries: localRuns[0]?.timingSummary?.overall.meanQueries,
        meanDbMs: localRuns[0]?.timingSummary?.overall.dbMsMean,
        meanLlmMs: localRuns[0]?.timingSummary?.overall.meanLlmMs,
        meanOtherMs: localRuns[0]?.timingSummary?.overall.meanOtherMs,
        turn1P50: localRuns[0]?.timingSummary?.turn1.turnMsP50,
        turn1P95: localRuns[0]?.timingSummary?.turn1.turnMsP95,
        turn1MeanDbMs: localRuns[0]?.timingSummary?.turn1.dbMsMean,
        turn1MeanQueries: localRuns[0]?.timingSummary?.turn1.meanQueries,
        laterTurnsP50: localRuns[0]?.timingSummary?.laterTurns.turnMsP50,
        laterTurnsP95: localRuns[0]?.timingSummary?.laterTurns.turnMsP95,
        laterTurnsMeanDbMs: localRuns[0]?.timingSummary?.laterTurns.dbMsMean,
        laterTurnsMeanQueries: localRuns[0]?.timingSummary?.laterTurns.meanQueries,
        topQuerySources: localRuns[0]?.timingSummary?.topQuerySources?.slice(0, 3),
      },
    };
  }

  const outPath = path.join(RESULTS_DIR, 'final-evaluation-report.json');
  await fs.writeFile(outPath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`Saved compiled report to: ${outPath}`);
}

main().catch(console.error);

