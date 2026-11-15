import fs from 'node:fs/promises';
import path from 'node:path';

async function main() {
  const files = [
    'live-eval-v1-run1.json',
    'live-eval-v1-run2.json',
    'live-eval-v1-run3.json',
    'live-eval-v2-run1.json',
    'live-eval-v2-run2.json',
    'live-eval-v2-run3.json',
  ];

  for (const f of files) {
    const p = path.resolve('../benchmarks/results', f);
    const content = JSON.parse(await fs.readFile(p, 'utf-8'));
    console.log(`\n=== ${f} ===`);
    console.log(`Timestamp: ${content.timestamp}`);
    console.log(`evalRunId: ${content.evalRunId}`);
    console.log(`datasetVersion: ${content.datasetVersion}`);
    console.log(`byEvaluator ROUTING_CORRECT:`, content.byEvaluator?.ROUTING_CORRECT);
    console.log(`Scenarios count:`, content.scenarioResults?.length);
    // Find conversation IDs in this run
    const convIds: string[] = [];
    for (const s of content.scenarioResults || []) {
      for (const t of s.turnResults || []) {
        // let's see what keys turnResults has
      }
    }
    const firstTurn = content.scenarioResults?.[0]?.turnResults?.[0];
    console.log('Sample turn result keys:', firstTurn ? Object.keys(firstTurn) : 'none');
    if (firstTurn) {
      console.log('Sample turn result:', {
        turnIndex: firstTurn.turnIndex,
        evaluatorResults: firstTurn.evaluatorResults,
        turnMs: firstTurn.turnMs,
        dbMs: firstTurn.dbMs,
        llmMs: firstTurn.llmMs,
        dbQueryCount: firstTurn.dbQueryCount,
        llmCallCount: firstTurn.llmCallCount,
      });
    }
  }
}

main().catch(console.error);

