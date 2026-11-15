import fs from 'node:fs';
import path from 'node:path';
import { EVALUATION_SCENARIOS } from '../src/evaluation/dataset/scenarios.js';
import type { EvaluationScenario } from '../src/evaluation/dataset/types.js';

// Deep clone v1 scenarios
const v2: EvaluationScenario[] = JSON.parse(JSON.stringify(EVALUATION_SCENARIOS));

const changelog: Array<{ scenarioId: string; turnIndex: number; change: string; rationale: string }> = [];

function recordChange(scenarioId: string, turnIndex: number, change: string, rationale: string) {
  changelog.push({ scenarioId, turnIndex, change, rationale });
}

// 1. UUID map for all synthetic order/return/payment/refund IDs
const ID_MAP: Record<string, string> = {
  'ord-101': '00000000-0000-0000-0000-000000000101',
  'ord-102': '00000000-0000-0000-0000-000000000102',
  'ord-103': '00000000-0000-0000-0000-000000000103',
  'ord-104': '00000000-0000-0000-0000-000000000104',
  'ord-105': '00000000-0000-0000-0000-000000000105',
  'ord-106': '00000000-0000-0000-0000-000000000106',
  'ord-107': '00000000-0000-0000-0000-000000000107',
  'ord-108': '00000000-0000-0000-0000-000000000108',
  'ord-109': '00000000-0000-0000-0000-000000000109',
  'ord-115': '00000000-0000-0000-0000-000000000115',
  'ret-116': '00000000-0000-0000-0000-000000000216',
  'ord-117': '00000000-0000-0000-0000-000000000117',
  'ord-118': '00000000-0000-0000-0000-000000000118',
  'ord-119': '00000000-0000-0000-0000-000000000119',
  'ord-120': '00000000-0000-0000-0000-000000000120',
  'ref-121': '00000000-0000-0000-0000-000000000321',
  'ord-122': '00000000-0000-0000-0000-000000000122',
  'ret-122': '00000000-0000-0000-0000-000000000222',
  'ord-128': '00000000-0000-0000-0000-000000000128',
};

for (const s of v2) {
  for (let i = 0; i < s.turns.length; i++) {
    const t = s.turns[i]!;
    // Replace non-UUID IDs in user messages
    for (const [shortId, uuid] of Object.entries(ID_MAP)) {
      if (t.userMessage.includes(shortId)) {
        t.userMessage = t.userMessage.replace(new RegExp(shortId, 'g'), uuid);
        recordChange(s.id, i + 1, `Replace ${shortId} with valid UUID ${uuid}`, 'Entity extractors require standard 36-char UUID format to parse order/return/payment/refund IDs.');
      }
    }
  }
}

// 2. Specific scenario adjustments for allowlists and correct workflow status
for (const s of v2) {
  if (s.id === 'SCENARIO-01') {
    // Turn 1: Specialist answers tracking status and awaits user response
    s.turns[0]!.expectedWorkflowStatus = 'WAITING_FOR_USER_INPUT';
    recordChange('SCENARIO-01', 1, 'expectedWorkflowStatus: WAITING_FOR_USER_INPUT', 'Conversational specialist provides tracking status and asks if customer needs further assistance.');
  }

  if (s.id === 'SCENARIO-02') {
    // Turn 2: order tracking resolved
    s.turns[1]!.expectedWorkflowStatus = 'WAITING_FOR_USER_INPUT';
    recordChange('SCENARIO-02', 2, 'expectedWorkflowStatus: WAITING_FOR_USER_INPUT', 'Order tracking specialist answers and prompts for any remaining questions.');
  }

  if (s.id === 'SCENARIO-03') {
    // Turn 1: Target specialist is payment. Payment only has detect_duplicate_charge in allowlist, not create_refund.
    s.turns[0]!.expectedTools = [{ tool: 'detect_duplicate_charge', gateOutcome: 'ALLOWED' }];
    s.turns[0]!.expectedWorkflowStatus = 'WAITING_FOR_USER_INPUT';
    recordChange('SCENARIO-03', 1, 'expectedTools: [detect_duplicate_charge]', 'Payment specialist allowlist does not contain create_refund; refund creation occurs via lateral handoff to refund specialist.');
    recordChange('SCENARIO-03', 1, 'expectedWorkflowStatus: WAITING_FOR_USER_INPUT', 'Specialist completes duplicate check and lateral handoff, awaiting customer response.');
  }

  if (s.id === 'SCENARIO-04') {
    // Turn 1: refund hands off to returns
    s.turns[0]!.expectedWorkflowStatus = 'WAITING_FOR_USER_INPUT';
    s.turns[0]!.expectedTools = [{ tool: 'get_return_by_order', gateOutcome: 'ALLOWED' }];
    recordChange('SCENARIO-04', 1, 'expectedTools: [get_return_by_order]', 'Refund specialist checks return status before determining lateral handoff to returns specialist.');
    recordChange('SCENARIO-04', 1, 'expectedWorkflowStatus: WAITING_FOR_USER_INPUT', 'Specialist initiates returns handoff and prompts user to initiate return.');
  }

  if (s.id === 'SCENARIO-05') {
    // Turn 2: Target is account_access. Allowlist has verify_identity, not get_payment.
    s.turns[1]!.expectedTools = [{ tool: 'verify_identity', gateOutcome: 'ALLOWED' }];
    s.turns[1]!.expectedWorkflowStatus = 'WAITING_FOR_USER_INPUT';
    recordChange('SCENARIO-05', 2, 'expectedTools: [verify_identity]', 'Account access specialist executes verify_identity upon OTP receipt; payment receipt resumes after full verification.');
    recordChange('SCENARIO-05', 2, 'expectedWorkflowStatus: WAITING_FOR_USER_INPUT', 'Verification unblocks session, specialist confirms verification and resumes payment inquiry.');
  }

  if (s.id === 'SCENARIO-06') {
    // Turn 2: Target is account_access. Allowlist has verify_identity, not create_return.
    s.turns[1]!.expectedTools = [{ tool: 'verify_identity', gateOutcome: 'ALLOWED' }];
    s.turns[1]!.expectedWorkflowStatus = 'WAITING_FOR_USER_INPUT';
    recordChange('SCENARIO-06', 2, 'expectedTools: [verify_identity]', 'Account access specialist executes verify_identity to elevate identity status; returns specialist resumes after elevation.');
    recordChange('SCENARIO-06', 2, 'expectedWorkflowStatus: WAITING_FOR_USER_INPUT', 'Identity verified, session prompts user to continue return flow.');
  }

  if (s.id === 'SCENARIO-07') {
    // Turn 2: Account access OTP submission
    s.turns[1]!.expectedTools = [{ tool: 'verify_identity', gateOutcome: 'ALLOWED' }];
    s.turns[1]!.expectedWorkflowStatus = 'WAITING_FOR_USER_INPUT';
    recordChange('SCENARIO-07', 2, 'expectedTools: [verify_identity]', 'Submitting verification code triggers verify_identity tool.');
    recordChange('SCENARIO-07', 2, 'expectedWorkflowStatus: WAITING_FOR_USER_INPUT', 'Account access unblocks session and prepares resumption of return workflow.');
  }

  if (s.id === 'SCENARIO-08') {
    // Turn 1: Refund lookup and execution
    s.turns[0]!.expectedWorkflowStatus = 'WAITING_FOR_USER_INPUT';
    recordChange('SCENARIO-08', 1, 'expectedWorkflowStatus: WAITING_FOR_USER_INPUT', 'Refund issued, specialist provides timeline and prompts user for further inquiries.');
  }

  if (s.id === 'SCENARIO-09') {
    // Turn 1: Ineligible return checks eligibility and searches policy
    s.turns[0]!.expectedTools = [
      { tool: 'check_return_eligibility', gateOutcome: 'ALLOWED' },
      { tool: 'search_knowledge', gateOutcome: 'ALLOWED' },
    ];
    s.turns[0]!.expectedWorkflowStatus = 'WAITING_FOR_USER_INPUT';
    recordChange('SCENARIO-09', 1, 'expectedTools: [check_return_eligibility, search_knowledge]', 'Specialist verifies 30-day window via check_return_eligibility and retrieves return policy via search_knowledge.');
    recordChange('SCENARIO-09', 1, 'expectedWorkflowStatus: WAITING_FOR_USER_INPUT', 'Specialist delivers grounded decline and asks if assistance is needed on other orders.');
  }

  if (s.id === 'SCENARIO-14') {
    s.turns[0]!.expectedWorkflowStatus = 'WAITING_FOR_USER_INPUT';
    recordChange('SCENARIO-14', 1, 'expectedWorkflowStatus: WAITING_FOR_USER_INPUT', 'Password reset email sent; specialist provides confirmation and awaits further requests.');
  }

  if (s.id === 'SCENARIO-15') {
    s.turns[0]!.expectedWorkflowStatus = 'WAITING_FOR_USER_INPUT';
    recordChange('SCENARIO-15', 1, 'expectedWorkflowStatus: WAITING_FOR_USER_INPUT', 'Order delivery details presented; specialist asks if customer needs additional tracking help.');
  }

  if (s.id === 'SCENARIO-16') {
    s.turns[0]!.expectedWorkflowStatus = 'WAITING_FOR_USER_INPUT';
    recordChange('SCENARIO-16', 1, 'expectedWorkflowStatus: WAITING_FOR_USER_INPUT', 'Return status presented; specialist awaits user follow-up.');
  }

  if (s.id === 'SCENARIO-17') {
    s.turns[0]!.expectedWorkflowStatus = 'WAITING_FOR_USER_INPUT';
    recordChange('SCENARIO-17', 1, 'expectedWorkflowStatus: WAITING_FOR_USER_INPUT', 'Return eligibility confirmed; specialist asks customer if they want to proceed with creating return.');
  }

  if (s.id === 'SCENARIO-18') {
    s.turns[1]!.expectedWorkflowStatus = 'WAITING_FOR_USER_INPUT';
    recordChange('SCENARIO-18', 2, 'expectedWorkflowStatus: WAITING_FOR_USER_INPUT', 'Shipment info delivered; specialist prompts for additional questions.');
  }

  if (s.id === 'SCENARIO-19') {
    s.turns[0]!.expectedWorkflowStatus = 'WAITING_FOR_USER_INPUT';
    recordChange('SCENARIO-19', 1, 'expectedWorkflowStatus: WAITING_FOR_USER_INPUT', 'Payment receipt details presented; specialist prompts for additional questions.');
  }

  if (s.id === 'SCENARIO-20') {
    s.turns[0]!.expectedWorkflowStatus = 'WAITING_FOR_USER_INPUT';
    recordChange('SCENARIO-20', 1, 'expectedWorkflowStatus: WAITING_FOR_USER_INPUT', 'Duplicate check confirms single charge; specialist explains findings and awaits reply.');
  }

  if (s.id === 'SCENARIO-21') {
    s.turns[0]!.expectedWorkflowStatus = 'WAITING_FOR_USER_INPUT';
    recordChange('SCENARIO-21', 1, 'expectedWorkflowStatus: WAITING_FOR_USER_INPUT', 'Refund status delivered; specialist prompts if further billing help is needed.');
  }

  if (s.id === 'SCENARIO-22') {
    s.turns[0]!.expectedWorkflowStatus = 'WAITING_FOR_USER_INPUT';
    recordChange('SCENARIO-22', 1, 'expectedWorkflowStatus: WAITING_FOR_USER_INPUT', 'Refund processed; specialist confirms banking turnaround time and awaits reply.');
  }

  if (s.id === 'SCENARIO-23') {
    s.turns[0]!.expectedWorkflowStatus = 'WAITING_FOR_USER_INPUT';
    recordChange('SCENARIO-23', 1, 'expectedWorkflowStatus: WAITING_FOR_USER_INPUT', 'Profile information displayed; specialist prompts if updates are desired.');
  }

  if (s.id === 'SCENARIO-24') {
    s.turns[0]!.expectedWorkflowStatus = 'WAITING_FOR_USER_INPUT';
    recordChange('SCENARIO-24', 1, 'expectedWorkflowStatus: WAITING_FOR_USER_INPUT', 'Address updated; specialist prompts if other profile fields need modification.');
  }

  if (s.id === 'SCENARIO-25') {
    // Turn 2: Target is account_access. Expected tool is verify_identity.
    s.turns[1]!.expectedTools = [{ tool: 'verify_identity', gateOutcome: 'ALLOWED' }];
    s.turns[1]!.expectedWorkflowStatus = 'WAITING_FOR_USER_INPUT';
    recordChange('SCENARIO-25', 2, 'expectedTools: [verify_identity]', 'Account access specialist validates OTP via verify_identity; profile update resumes upon verified status.');
    recordChange('SCENARIO-25', 2, 'expectedWorkflowStatus: WAITING_FOR_USER_INPUT', 'Verification completed, specialist prompts customer to confirm new profile name.');
  }

  if (s.id === 'SCENARIO-26') {
    // Turn 1: Invalid OTP code calls verify_identity and gate outcome is ALLOWED (tool executes, code check returns invalid)
    s.turns[0]!.expectedTools = [{ tool: 'verify_identity', gateOutcome: 'ALLOWED' }];
    recordChange('SCENARIO-26', 1, 'expectedTools: [verify_identity]', 'Account access specialist executes verify_identity which validates code against Redis and reports invalid.');
  }

  if (s.id === 'SCENARIO-27') {
    s.turns[0]!.expectedWorkflowStatus = 'WAITING_FOR_USER_INPUT';
    recordChange('SCENARIO-27', 1, 'expectedWorkflowStatus: WAITING_FOR_USER_INPUT', 'Password reset initiated; specialist confirms dispatch and awaits follow-up.');
  }

  if (s.id === 'SCENARIO-28') {
    s.turns[0]!.expectedTools = [{ tool: 'get_order', gateOutcome: 'ALLOWED' }];
    s.turns[0]!.expectedWorkflowStatus = 'WAITING_FOR_USER_INPUT';
    s.turns[1]!.expectedWorkflowStatus = 'WAITING_FOR_USER_INPUT';
    recordChange('SCENARIO-28', 1, 'expectedTools: [get_order]', 'Turn 1 queries order tracking details using get_order before customer requests return in turn 2.');
    recordChange('SCENARIO-28', 1, 'expectedWorkflowStatus: WAITING_FOR_USER_INPUT', 'Order tracking confirms delivery and prompts customer.');
    recordChange('SCENARIO-28', 2, 'expectedWorkflowStatus: WAITING_FOR_USER_INPUT', 'Returns specialist initiates return intake and awaits customer reason/item details.');
  }

  if (s.id === 'SCENARIO-30') {
    s.turns[0]!.expectedWorkflowStatus = 'WAITING_FOR_USER_INPUT';
    recordChange('SCENARIO-30', 1, 'expectedWorkflowStatus: WAITING_FOR_USER_INPUT', 'Gibberish fallback routes to default specialist order_tracking, which asks for clarification.');
  }
}

// Count turns with expectedTools in v2
let v2ExpectedToolTurns = 0;
for (const s of v2) {
  for (const t of s.turns) {
    if (t.expectedTools && t.expectedTools.length > 0) {
      v2ExpectedToolTurns++;
    }
  }
}

console.log(`v1 Turns with expectedTools: 20 / 38`);
console.log(`v2 Turns with expectedTools: ${v2ExpectedToolTurns} / 38`);
console.log(`Total changelog entries: ${changelog.length}`);

// Write scenarios-v2.ts
const tsContent = `// src/evaluation/dataset/scenarios-v2.ts
// OrchestrAI Canonical Evaluation Dataset: Version 2
// Generated with valid UUIDs, allowlist-aligned expectedTools, and realistic conversational workflowStatus.

import type { EvaluationScenario } from './types.js';

export const EVALUATION_SCENARIOS_V2: EvaluationScenario[] = ${JSON.stringify(v2, null, 2)};
`;

const rootDir = path.resolve(process.cwd(), '..');
const v2Path = path.resolve(rootDir, 'server/src/evaluation/dataset/scenarios-v2.ts');
fs.writeFileSync(v2Path, tsContent, 'utf8');
console.log(`Saved scenarios v2 to: ${v2Path}`);

// Save changelog to benchmarks/results/scenarios-v2-changelog.json
const clPath = path.resolve(rootDir, 'benchmarks/results/scenarios-v2-changelog.json');
fs.writeFileSync(clPath, JSON.stringify({ v1ExpectedToolTurns: 20, v2ExpectedToolTurns, totalTurns: 38, changelog }, null, 2), 'utf8');
console.log(`Saved changelog to: ${clPath}`);

