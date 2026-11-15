import fs from 'node:fs/promises';
import path from 'node:path';

async function main() {
  const v1p = path.resolve('../benchmarks/results/live-eval-v1-run1.json');
  const v1 = JSON.parse(await fs.readFile(v1p, 'utf-8'));

  const failedScenarios = ['SCENARIO-05', 'SCENARIO-07', 'SCENARIO-13', 'SCENARIO-14', 'SCENARIO-23', 'SCENARIO-24', 'SCENARIO-25', 'SCENARIO-26', 'SCENARIO-27'];

  console.log('=== FAILED TURNS IN live-v1-run1 ===');
  for (const sc of v1.scenarioResults) {
    if (failedScenarios.includes(sc.scenario.id)) {
      console.log(`\n--- Scenario: ${sc.scenario.id} (${sc.scenario.title}) ---`);
      for (const tr of sc.turnResults) {
        console.log(`Turn ${tr.turnIndex}: user="${tr.turn.userMessage}"`);
        const failedEvals = tr.evaluatorResults.filter((e: any) => !e.passed);
        for (const fe of failedEvals) {
          console.log(`  [FAILED ${fe.evaluator}] reasoning: ${fe.reasoning}`);
        }
      }
    }
  }

  console.log('\n=== ESCALATED TURNS IN live-v2-run1 ===');
  const v2p = path.resolve('../benchmarks/results/live-eval-v2-run1.json');
  const v2 = JSON.parse(await fs.readFile(v2p, 'utf-8'));

  for (const sc of v2.scenarioResults) {
    for (const tr of sc.turnResults) {
      const wfEval = tr.evaluatorResults.find((e: any) => e.evaluator === 'WORKFLOW_COMPLETED');
      if (wfEval && wfEval.reasoning?.includes('ESCALATED')) {
        console.log(`\nScenario: ${sc.scenario.id} Turn ${tr.turnIndex}`);
        console.log(`User: "${tr.turn.userMessage}"`);
        console.log(`Evaluator reason: ${wfEval.reasoning}`);
        // Let's check executed tools or reasoning
        const toolEval = tr.evaluatorResults.find((e: any) => e.evaluator === 'TOOL_SELECTION_CORRECT');
        console.log(`Tool eval reasoning: ${toolEval?.reasoning}`);
      }
    }
  }
}

main().catch(console.error);

