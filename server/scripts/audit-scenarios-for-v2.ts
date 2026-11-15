import { EVALUATION_SCENARIOS } from '../src/evaluation/dataset/scenarios.js';
import { EVALUATION_SCENARIOS_V2 } from '../src/evaluation/dataset/scenarios-v2.js';

let v1Turns = 0;
let v1ToolTurns = 0;
for (const s of EVALUATION_SCENARIOS) {
  for (let i = 0; i < s.turns.length; i++) {
    v1Turns++;
    if (s.turns[i]!.expectedTools && s.turns[i]!.expectedTools.length > 0) {
      v1ToolTurns++;
    }
  }
}

let v2Turns = 0;
let v2ToolTurns = 0;
for (const s of EVALUATION_SCENARIOS_V2) {
  for (let i = 0; i < s.turns.length; i++) {
    v2Turns++;
    const t = s.turns[i]!;
    const hasTools = t.expectedTools && t.expectedTools.length > 0;
    if (hasTools) {
      v2ToolTurns++;
    }
    console.log(`${s.id} turn ${i + 1} (${s.domain}): ${hasTools ? t.expectedTools?.map((x) => x.tool).join(',') : 'NO TOOLS'} | msg: "${t.userMessage.slice(0, 45)}"`);
  }
}

console.log(`v1 Total Turns: ${v1Turns}, with expectedTools: ${v1ToolTurns}`);
console.log(`v2 Total Turns: ${v2Turns}, with expectedTools: ${v2ToolTurns}`);
