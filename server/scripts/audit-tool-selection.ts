// scripts/audit-tool-selection.ts
import { EVALUATION_SCENARIOS } from '../src/evaluation/dataset/scenarios.js';
import { TOOL_ALLOWLIST } from '../src/tools/permissions.js';

async function main() {
  console.log('=== Scenario Tool Expectations vs Specialist Tool Allowlist ===\n');

  let totalTurns = 0;
  let turnsWithExpectedTools = 0;
  let turnsWithoutExpectedTools = 0;

  for (const s of EVALUATION_SCENARIOS) {
    s.turns.forEach((t, i) => {
      totalTurns++;
      if (!t.expectedTools || t.expectedTools.length === 0) {
        turnsWithoutExpectedTools++;
      } else {
        turnsWithExpectedTools++;
        console.log(`[${s.id} Turn ${i + 1}] (${s.domain}) Target: ${t.expectedTargetSpecialist ?? 'none'}`);
        console.log(`   Expected Tools:`, t.expectedTools);
        if (t.expectedTargetSpecialist && TOOL_ALLOWLIST[t.expectedTargetSpecialist as any]) {
          const allowed = Array.from(TOOL_ALLOWLIST[t.expectedTargetSpecialist as any]);
          console.log(`   Specialist Allowlist:`, allowed);
          for (const exp of t.expectedTools) {
            const isAllowed = allowed.includes(exp.tool);
            console.log(`     - Tool "${exp.tool}": ${isAllowed ? '✅ in allowlist' : '❌ NOT IN ALLOWLIST'}`);
          }
        }
      }
    });
  }

  console.log(`\nTotal turns: ${totalTurns}`);
  console.log(`Turns with expectedTools: ${turnsWithExpectedTools}`);
  console.log(`Turns without expectedTools: ${turnsWithoutExpectedTools} (Passes trivially: ${turnsWithoutExpectedTools}/${totalTurns} = ${(turnsWithoutExpectedTools/totalTurns*100).toFixed(1)}%)`);
}

main().catch(console.error);

