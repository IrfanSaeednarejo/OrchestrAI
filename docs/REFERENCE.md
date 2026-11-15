# REFERENCE (locked data)

## Specialists (6, 3 domains)
Orders: Order Tracking, Returns. Payments: Payment, Refund. Account: Profile, Account Access.

## Tool -> allowed specialists (enforced by the gate allowlist)
get_order: Order Tracking, Returns, Payment, Refund | get_shipment_status: Order Tracking, Returns | check_return_eligibility, create_return: Returns |
get_return_status, get_return_by_order: Returns, Refund | get_payment: Payment, Refund | detect_duplicate_charge: Payment | create_refund, get_refund_status: Refund |
get_profile, update_profile: Profile | start_identity_verification, verify_identity, initiate_password_reset: Account Access.
search_knowledge: every specialist except Profile (scoped per below).

## Verification policy (tool requirement: NONE < LIGHT < FULL)
LIGHT (email + order number): get_order, get_shipment_status, check_return_eligibility, get_return_status, get_return_by_order.
FULL (email + mock one-time code): create_return, get_payment, detect_duplicate_charge, create_refund, get_refund_status, get_profile, update_profile.
NONE: start_identity_verification, verify_identity, initiate_password_reset, search_knowledge.
Identity status (UNVERIFIED / LIGHTLY_VERIFIED / VERIFIED) is distinct from requirement levels; `satisfiesVerification` bridges them.

## RAG scope (domain AND topic)
Order Tracking: orders/shipping | Returns: orders/returns | Payment: payments/payments | Refund: payments/refunds |
Account Access: account/account_security | Profile: none.

## 14 evaluation scenarios (acceptance for Phase 12; expand to 30-50 in Phase 15)
1 Simple order status, single order, LIGHT.
2 Ambiguous order reference -> WAITING_FOR_USER_INPUT -> resolved.
3 Duplicate charge confirmed -> Payment -> Refund.
4 Refund inquiry with no linked return -> Refund -> Returns.
5 Payment inquiry while unverified -> Account Access FULL -> resume Payment.
6 Return creation with only LIGHT -> Account Access FULL -> resume Returns.
7 Login issue mid-Returns flow -> Account Access -> resume Returns.
8 Return approved, refund not yet created -> structured check -> create_refund (not RAG).
9 Ineligible return -> RAG policy explanation -> hard decline.
10 Routing loop A->Parent->B->Parent->A -> fallback/escalate.
11 Tool failure (e.g. get_payment timeout) -> retry once -> escalate.
12 Max handoff count exceeded -> escalate.
13 Identity mutation attempted by non-Account-Access agent -> rejected/impossible by design.
14 Password reset does NOT change identity.status -> separate re-verification required.

## Handoff patterns
B: specialist detects out-of-scope -> hands back to parent -> parent router re-routes (Command with graph=Command.PARENT).
C: specialist blocked (e.g. insufficient verification) -> records activeWorkflow {blockedBy, returnTo, resumeContext} -> routed to Account Access -> resumes original specialist.
A: NOT DEFINED in prior notes (see OPEN-DECISIONS #1).

## Core types (see code for truth)
RoutingState {currentAgent, previousAgent, history, handoffCount, visitedAgents}; IdentityState {status, verificationMethod, verifiedAt};
ReturnTo {domain, agent, workflowStep|null}; ActiveWorkflowState {workflowId, originatingIntent, currentStep, blockedBy, returnTo, resumeContext};
WorkflowStatus: ACTIVE | WAITING_FOR_USER_INPUT | BLOCKED | COMPLETED | ESCALATED | FAILED.
Routing decision types: INITIAL_ROUTE | RE_ROUTE | HANDOFF | ESCALATION | FALLBACK.
