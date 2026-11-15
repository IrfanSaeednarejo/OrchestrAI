import 'dotenv/config';
import { db } from '../src/persistence/db/client.js';
import { sql } from 'drizzle-orm';
import fs from 'node:fs/promises';
import path from 'node:path';

async function main() {
  const files = [
    { file: 'live-eval-v1-run1.json', label: 'v1-run1' },
    { file: 'live-eval-v1-run2.json', label: 'v1-run2' },
    { file: 'live-eval-v1-run3.json', label: 'v1-run3' },
    { file: 'live-eval-v2-run1.json', label: 'v2-run1' },
    { file: 'live-eval-v2-run2.json', label: 'v2-run2' },
    { file: 'live-eval-v2-run3.json', label: 'v2-run3' },
  ];

  for (const { file, label } of files) {
    const p = path.resolve('../benchmarks/results', file);
    const content = JSON.parse(await fs.readFile(p, 'utf-8'));
    console.log(`\n======================================================`);
    console.log(`Run: ${label} | File: ${file}`);
    console.log(`Timestamp: ${content.timestamp}`);
    console.log(`ROUTING_CORRECT: ${content.byEvaluator?.ROUTING_CORRECT?.passed} / ${content.byEvaluator?.ROUTING_CORRECT?.total} (${(content.byEvaluator?.ROUTING_CORRECT?.rate * 100).toFixed(1)}%)`);
    console.log(`TOOL_SELECTION_CORRECT: ${content.byEvaluator?.TOOL_SELECTION_CORRECT?.passed} / ${content.byEvaluator?.TOOL_SELECTION_CORRECT?.total} (${(content.byEvaluator?.TOOL_SELECTION_CORRECT?.rate * 100).toFixed(1)}%)`);
    
    // Count fallback routing across scenario turns
    let fallbackCount = 0;
    let expectedCount = 0;
    for (const sc of content.scenarioResults || []) {
      for (const tr of sc.turnResults || []) {
        expectedCount++;
        const routingEval = tr.evaluatorResults?.find((e: any) => e.evaluator === 'ROUTING_CORRECT');
        if (routingEval && !routingEval.passed && routingEval.reasoning?.includes('general_assistant')) {
          fallbackCount++;
        }
      }
    }
    console.log(`Fallback to general_assistant: ${fallbackCount} / ${expectedCount}`);
  }
}

main().catch(console.error);

