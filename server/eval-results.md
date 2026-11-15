# OrchestrAI Evaluation Benchmark Report

**Generated**: 2026-11-14T18:09:39.932Z  
**Run ID**: live-v2-paced  
**Dataset Version**: v2  
**Checkpointer**: PostgresSaver  
**Total Scenarios**: 30  
**Passed Scenarios**: 0  
**Overall Pass Rate**: 0.0%

## 0. Latency & Query Decomposition

| Scope | Turns (N) | Turn ms (p50/p95/mean) | DB ms (p50/p95/mean) | Mean DB Queries | Mean LLM ms | Mean Other ms |
|---|---:|---:|---:|---:|---:|---:|
| Overall | 38 | 6960 / 11412 / 7488 | 13021 / 18855 / 13695.8 | 51.2 | 1896.9 | 0 |
| Turn 1 | 30 | 7039 / 11000 / 7505.4 | 13138 / 17795 / 13721.4 | 52 | 1903 | 0 |
| Later Turns | 8 | 6646 / 10546 / 7422.8 | 12503 / 18321 / 13599.8 | 48 | 1874.1 | 0 |

### Top DB Query Sources

| Source File | Query Count | Total DB ms |
|---|---:|---:|
| `src/index.ts:600` | 587 | 150237 |
| `src/index.ts:651` | 435 | 106200 |
| `src/node-postgres/session.ts:161` | 122 | 53587 |
| `src/index.ts:613` | 152 | 38639 |
| `src/index.ts:605` | 152 | 38146 |

## 1. Domain Performance

| Domain | Total Scenarios | Passed | Pass Rate |
|---|---:|---:|---:|
| orders | 7 | 0 | 0.0% |
| cross-domain | 12 | 0 | 0.0% |
| payments | 5 | 0 | 0.0% |
| account | 6 | 0 | 0.0% |

## 2. Evaluator Performance

| Evaluator | Total Checks | Passed | Pass Rate |
|---|---:|---:|---:|
| ROUTING_CORRECT | 38 | 7 | 18.4% |
| HANDOFF_CORRECT | 38 | 36 | 94.7% |
| SPECIALIST_SCOPE_CORRECT | 38 | 38 | 100.0% |
| TOOL_SELECTION_CORRECT | 38 | 15 | 39.5% |
| STATE_PRESERVED | 38 | 38 | 100.0% |
| KNOWLEDGE_GROUNDED | 38 | 23 | 60.5% |
| WORKFLOW_COMPLETED | 38 | 31 | 81.6% |
| RESOLUTION_CORRECT | 38 | 32 | 84.2% |

## 3. Scenario Details

| ID | Scenario Name | Domain | Pattern | Turns | Result |
|---|---|---|---|---:|:---:|
| SCENARIO-01 | Simple order status, single order, LIGHT | orders | PATTERN_A | 1 | ❌ FAIL |
| SCENARIO-02 | Ambiguous order reference -> clarification -> resolved | orders | PATTERN_A | 2 | ❌ FAIL |
| SCENARIO-03 | Duplicate charge confirmed -> Payment -> Refund lateral handoff | cross-domain | PATTERN_B | 1 | ❌ FAIL |
| SCENARIO-04 | Refund inquiry with no linked return -> Refund -> Returns lateral handoff | cross-domain | PATTERN_B | 1 | ❌ FAIL |
| SCENARIO-05 | Payment inquiry while unverified -> Account Access FULL -> resume Payment | cross-domain | PATTERN_C | 2 | ❌ FAIL |
| SCENARIO-06 | Return creation with only LIGHT -> Account Access FULL -> resume Returns | cross-domain | PATTERN_C | 2 | ❌ FAIL |
| SCENARIO-07 | Login issue mid-Returns flow -> Account Access -> resume Returns | cross-domain | PATTERN_C | 2 | ❌ FAIL |
| SCENARIO-08 | Return approved, refund not yet created -> structured check -> create_refund | payments | PATTERN_A | 1 | ❌ FAIL |
| SCENARIO-09 | Ineligible return -> RAG policy explanation -> hard decline | orders | PATTERN_A | 1 | ❌ FAIL |
| SCENARIO-10 | Routing loop A->Parent->B->Parent->A -> loop detection -> escalate | cross-domain | SAFETY_ESCALATION | 1 | ❌ FAIL |
| SCENARIO-11 | Tool transient failure timeout -> retry once -> escalate | cross-domain | SAFETY_ESCALATION | 1 | ❌ FAIL |
| SCENARIO-12 | Max handoff count exceeded (>= 3) -> escalate | cross-domain | SAFETY_ESCALATION | 1 | ❌ FAIL |
| SCENARIO-13 | Identity mutation attempted outside Account Access -> rejected by boundary | account | SECURITY_BOUNDARY | 1 | ❌ FAIL |
| SCENARIO-14 | Password reset does NOT change identity.status -> separate re-verification | account | SECURITY_BOUNDARY | 1 | ❌ FAIL |
| SCENARIO-15 | Delivered order shipping tracking inquiry | orders | PATTERN_A | 1 | ❌ FAIL |
| SCENARIO-16 | Return status check for active return | orders | PATTERN_A | 1 | ❌ FAIL |
| SCENARIO-17 | Return eligibility pre-check within 30-day window | orders | PATTERN_A | 1 | ❌ FAIL |
| SCENARIO-18 | Multi-turn order clarification and subsequent shipment check | orders | PATTERN_A | 2 | ❌ FAIL |
| SCENARIO-19 | Payment status check on captured charge | payments | PATTERN_A | 1 | ❌ FAIL |
| SCENARIO-20 | Duplicate charge inquiry with no duplicate confirmed | payments | PATTERN_A | 1 | ❌ FAIL |
| SCENARIO-21 | Refund status inquiry for completed refund | payments | PATTERN_A | 1 | ❌ FAIL |
| SCENARIO-22 | Direct refund creation for approved return without duplicate charges | payments | PATTERN_A | 1 | ❌ FAIL |
| SCENARIO-23 | View customer profile while VERIFIED | account | PATTERN_A | 1 | ❌ FAIL |
| SCENARIO-24 | Update customer address while VERIFIED | account | PATTERN_A | 1 | ❌ FAIL |
| SCENARIO-25 | Profile update blocked for UNVERIFIED customer -> routed to Account Access | cross-domain | PATTERN_C | 2 | ❌ FAIL |
| SCENARIO-26 | Invalid OTP code submitted during verification flow | account | SAFETY_ESCALATION | 1 | ❌ FAIL |
| SCENARIO-27 | Password reset request with valid email format | account | SECURITY_BOUNDARY | 1 | ❌ FAIL |
| SCENARIO-28 | Order Tracking lateral handoff to Returns upon customer return request | cross-domain | PATTERN_B | 2 | ❌ FAIL |
| SCENARIO-29 | Terminal ESCALATED state lock multi-turn enforcement | cross-domain | SAFETY_ESCALATION | 2 | ❌ FAIL |
| SCENARIO-30 | Classifier fallback default to order_tracking on ambiguous gibberish | cross-domain | SAFETY_ESCALATION | 1 | ❌ FAIL |

