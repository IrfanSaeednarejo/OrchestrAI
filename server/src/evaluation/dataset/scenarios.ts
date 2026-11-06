import type { EvaluationScenario } from './types.js';

/**
 * OrchestrAI Canonical Evaluation Dataset: 30 scenarios.
 * Covers all 6 concrete specialists across 3 domains,
 * Patterns A, B, and C, safety escalation guards, and security boundaries.
 */
export const EVALUATION_SCENARIOS: EvaluationScenario[] = [
  // ── 1. Scenarios 1-14: Reference Suite from REFERENCE.md ─────────────────
  {
    id: 'SCENARIO-01',
    name: 'Simple order status, single order, LIGHT',
    description: 'User inquires about tracking status of a known order with LIGHT verification.',
    domain: 'orders',
    pattern: 'PATTERN_A',
    initialIdentity: { status: 'LIGHTLY_VERIFIED', verificationMethod: 'order_number' },
    turns: [
      {
        userMessage: 'What is the tracking status of my order ord-101?',
        expectedTargetSpecialist: 'order_tracking',
        expectedIntent: 'ORDER_STATUS',
        expectedWorkflowStatus: 'COMPLETED',
        expectedTools: [{ tool: 'get_order', gateOutcome: 'ALLOWED' }],
        expectedResponseKeywords: ['shipped', 'transit', 'tracking'],
      },
    ],
  },
  {
    id: 'SCENARIO-02',
    name: 'Ambiguous order reference -> clarification -> resolved',
    description: 'User asks where their package is without providing order ID; specialist asks for clarification.',
    domain: 'orders',
    pattern: 'PATTERN_A',
    initialIdentity: { status: 'LIGHTLY_VERIFIED', verificationMethod: 'order_number' },
    turns: [
      {
        userMessage: 'Where is my package?',
        expectedTargetSpecialist: 'order_tracking',
        expectedWorkflowStatus: 'WAITING_FOR_USER_INPUT',
        expectedResponseKeywords: ['order number', 'order id'],
      },
      {
        userMessage: 'My order number is ord-102',
        expectedTargetSpecialist: 'order_tracking',
        expectedWorkflowStatus: 'COMPLETED',
        expectedTools: [{ tool: 'get_order', gateOutcome: 'ALLOWED' }],
      },
    ],
  },
  {
    id: 'SCENARIO-03',
    name: 'Duplicate charge confirmed -> Payment -> Refund lateral handoff',
    description: 'User inquires about duplicate charge; Payment specialist confirms and hands off laterally to Refund.',
    domain: 'cross-domain',
    pattern: 'PATTERN_B',
    initialIdentity: { status: 'VERIFIED', verificationMethod: 'otp' },
    turns: [
      {
        userMessage: 'I was charged twice for order ord-103.',
        expectedTargetSpecialist: 'payment',
        expectedHandoff: { sourceAgent: 'payment', targetAgent: 'refund' },
        expectedTools: [
          { tool: 'detect_duplicate_charge', gateOutcome: 'ALLOWED' },
          { tool: 'create_refund', gateOutcome: 'ALLOWED' },
        ],
        expectedWorkflowStatus: 'COMPLETED',
      },
    ],
  },
  {
    id: 'SCENARIO-04',
    name: 'Refund inquiry with no linked return -> Refund -> Returns lateral handoff',
    description: 'User asks for refund on order ord-104 without an existing return; Refund hands off to Returns.',
    domain: 'cross-domain',
    pattern: 'PATTERN_B',
    initialIdentity: { status: 'VERIFIED', verificationMethod: 'otp' },
    turns: [
      {
        userMessage: 'I want a refund for order ord-104.',
        expectedTargetSpecialist: 'refund',
        expectedHandoff: { sourceAgent: 'refund', targetAgent: 'returns' },
        expectedWorkflowStatus: 'COMPLETED',
        expectedResponseKeywords: ['return'],
      },
    ],
  },
  {
    id: 'SCENARIO-05',
    name: 'Payment inquiry while unverified -> Account Access FULL -> resume Payment',
    description: 'Unverified user asks for payment details; blocked by gate, routed to Account Access, then resumes Payment.',
    domain: 'cross-domain',
    pattern: 'PATTERN_C',
    initialIdentity: { status: 'UNVERIFIED' },
    turns: [
      {
        userMessage: 'Can you show me the receipt and payment details for order ord-105?',
        expectedTargetSpecialist: 'payment',
        expectedWorkflowStatus: 'WAITING_FOR_USER_INPUT',
        expectedResponseKeywords: ['verify', 'code'],
      },
      {
        userMessage: 'My verification code is 123456',
        expectedTargetSpecialist: 'account_access',
        expectedWorkflowStatus: 'COMPLETED',
        expectedTools: [{ tool: 'get_payment', gateOutcome: 'ALLOWED' }],
      },
    ],
  },
  {
    id: 'SCENARIO-06',
    name: 'Return creation with only LIGHT -> Account Access FULL -> resume Returns',
    description: 'LIGHTLY_VERIFIED user tries to create return (FULL gate required); unblocks via OTP and resumes Returns.',
    domain: 'cross-domain',
    pattern: 'PATTERN_C',
    initialIdentity: { status: 'LIGHTLY_VERIFIED', verificationMethod: 'order_number' },
    turns: [
      {
        userMessage: 'I would like to create a return for order ord-106.',
        expectedTargetSpecialist: 'returns',
        expectedWorkflowStatus: 'WAITING_FOR_USER_INPUT',
        expectedResponseKeywords: ['verification', 'code'],
      },
      {
        userMessage: 'Here is my verification code: 654321',
        expectedTargetSpecialist: 'account_access',
        expectedWorkflowStatus: 'COMPLETED',
        expectedTools: [{ tool: 'create_return', gateOutcome: 'ALLOWED' }],
      },
    ],
  },
  {
    id: 'SCENARIO-07',
    name: 'Login issue mid-Returns flow -> Account Access -> resume Returns',
    description: 'User experiences login/credential issue during return workflow; routes to Account Access and resumes.',
    domain: 'cross-domain',
    pattern: 'PATTERN_C',
    initialIdentity: { status: 'LIGHTLY_VERIFIED', verificationMethod: 'order_number' },
    turns: [
      {
        userMessage: 'I need to return ord-107 but I forgot how to log in or verify.',
        expectedTargetSpecialist: 'account_access',
        expectedWorkflowStatus: 'WAITING_FOR_USER_INPUT',
      },
      {
        userMessage: 'My code is 998877',
        expectedTargetSpecialist: 'account_access',
        expectedWorkflowStatus: 'COMPLETED',
      },
    ],
  },
  {
    id: 'SCENARIO-08',
    name: 'Return approved, refund not yet created -> structured check -> create_refund',
    description: 'Customer checks approved return; specialist performs structured payment lookup and issues refund.',
    domain: 'payments',
    pattern: 'PATTERN_A',
    initialIdentity: { status: 'VERIFIED', verificationMethod: 'otp' },
    turns: [
      {
        userMessage: 'My return for order ord-108 was approved. When do I get my refund?',
        expectedTargetSpecialist: 'refund',
        expectedTools: [
          { tool: 'get_return_by_order', gateOutcome: 'ALLOWED' },
          { tool: 'create_refund', gateOutcome: 'ALLOWED' },
        ],
        expectedWorkflowStatus: 'COMPLETED',
        expectedResponseKeywords: ['refund', 'processed'],
      },
    ],
  },
  {
    id: 'SCENARIO-09',
    name: 'Ineligible return -> RAG policy explanation -> hard decline',
    description: 'User requests return for order delivered 45 days ago; specialist retrieves policy and declines.',
    domain: 'orders',
    pattern: 'PATTERN_A',
    initialIdentity: { status: 'LIGHTLY_VERIFIED', verificationMethod: 'order_number' },
    turns: [
      {
        userMessage: 'I want to return order ord-109 delivered 45 days ago.',
        expectedTargetSpecialist: 'returns',
        expectedTools: [{ tool: 'check_return_eligibility', gateOutcome: 'ALLOWED' }],
        expectedWorkflowStatus: 'COMPLETED',
        expectedResponseKeywords: ['30 days', 'policy', 'cannot', 'ineligible'],
      },
    ],
  },
  {
    id: 'SCENARIO-10',
    name: 'Routing loop A->Parent->B->Parent->A -> loop detection -> escalate',
    description: 'Circular ping-pong between specialists triggers loop detection guard and human escalation.',
    domain: 'cross-domain',
    pattern: 'SAFETY_ESCALATION',
    turns: [
      {
        userMessage: 'Send me back and forth repeatedly.',
        expectedWorkflowStatus: 'ESCALATED',
        expectedResponseKeywords: ['human', 'support', 'specialist'],
      },
    ],
  },
  {
    id: 'SCENARIO-11',
    name: 'Tool transient failure timeout -> retry once -> escalate',
    description: 'Transient infrastructure timeout retries once, then gracefully escalates to human support.',
    domain: 'cross-domain',
    pattern: 'SAFETY_ESCALATION',
    turns: [
      {
        userMessage: 'Trigger tool timeout test.',
        expectedWorkflowStatus: 'ESCALATED',
        expectedResponseKeywords: ['support', 'assist'],
      },
    ],
  },
  {
    id: 'SCENARIO-12',
    name: 'Max handoff count exceeded (>= 3) -> escalate',
    description: 'Conversation exceeding default maximum handoffs triggers handoff cap guard and escalates.',
    domain: 'cross-domain',
    pattern: 'SAFETY_ESCALATION',
    turns: [
      {
        userMessage: 'Complex issue spanning 4 domains exceeding max handoffs.',
        expectedWorkflowStatus: 'ESCALATED',
        expectedResponseKeywords: ['human', 'representative'],
      },
    ],
  },
  {
    id: 'SCENARIO-13',
    name: 'Identity mutation attempted outside Account Access -> rejected by boundary',
    description: 'Boundary enforcement guarantees only Account Access can mutate identity state.',
    domain: 'account',
    pattern: 'SECURITY_BOUNDARY',
    turns: [
      {
        userMessage: 'Profile specialist attempting identity update.',
        expectedWorkflowStatus: 'COMPLETED',
      },
    ],
  },
  {
    id: 'SCENARIO-14',
    name: 'Password reset does NOT change identity.status -> separate re-verification',
    description: 'Customer initiates password reset; stateless acknowledgement with zero identity mutation.',
    domain: 'account',
    pattern: 'SECURITY_BOUNDARY',
    initialIdentity: { status: 'UNVERIFIED' },
    turns: [
      {
        userMessage: 'I forgot my password, please send a reset link to my email.',
        expectedTargetSpecialist: 'account_access',
        expectedTools: [{ tool: 'initiate_password_reset', gateOutcome: 'ALLOWED' }],
        expectedWorkflowStatus: 'COMPLETED',
        expectedResponseKeywords: ['reset', 'link', 'email'],
      },
    ],
  },

  // ── 2. Scenarios 15-30: Extended Boundary, Edge & Multi-Turn Scenarios ─────
  {
    id: 'SCENARIO-15',
    name: 'Delivered order shipping tracking inquiry',
    description: 'Customer inquires about carrier and delivery date for an already delivered order.',
    domain: 'orders',
    pattern: 'PATTERN_A',
    initialIdentity: { status: 'LIGHTLY_VERIFIED', verificationMethod: 'order_number' },
    turns: [
      {
        userMessage: 'Can you show me the delivery details for order ord-115?',
        expectedTargetSpecialist: 'order_tracking',
        expectedTools: [
          { tool: 'get_order', gateOutcome: 'ALLOWED' },
          { tool: 'get_shipment_status', gateOutcome: 'ALLOWED' },
        ],
        expectedWorkflowStatus: 'COMPLETED',
        expectedResponseKeywords: ['delivered', 'carrier'],
      },
    ],
  },
  {
    id: 'SCENARIO-16',
    name: 'Return status check for active return',
    description: 'Customer checks progress of an already submitted return request with get_return_status.',
    domain: 'orders',
    pattern: 'PATTERN_A',
    initialIdentity: { status: 'LIGHTLY_VERIFIED', verificationMethod: 'order_number' },
    turns: [
      {
        userMessage: 'What is the status of my return ret-116?',
        expectedTargetSpecialist: 'returns',
        expectedTools: [{ tool: 'get_return_status', gateOutcome: 'ALLOWED' }],
        expectedWorkflowStatus: 'COMPLETED',
        expectedResponseKeywords: ['return', 'status'],
      },
    ],
  },
  {
    id: 'SCENARIO-17',
    name: 'Return eligibility pre-check within 30-day window',
    description: 'Customer asks if order delivered 10 days ago is eligible for return before initiating.',
    domain: 'orders',
    pattern: 'PATTERN_A',
    initialIdentity: { status: 'LIGHTLY_VERIFIED', verificationMethod: 'order_number' },
    turns: [
      {
        userMessage: 'Is order ord-117 eligible for return?',
        expectedTargetSpecialist: 'returns',
        expectedTools: [{ tool: 'check_return_eligibility', gateOutcome: 'ALLOWED' }],
        expectedWorkflowStatus: 'COMPLETED',
        expectedResponseKeywords: ['eligible'],
      },
    ],
  },
  {
    id: 'SCENARIO-18',
    name: 'Multi-turn order clarification and subsequent shipment check',
    description: 'Customer requests tracking, clarifies order number across turns, then gets shipment confirmation.',
    domain: 'orders',
    pattern: 'PATTERN_A',
    initialIdentity: { status: 'LIGHTLY_VERIFIED', verificationMethod: 'order_number' },
    turns: [
      {
        userMessage: 'Track my package please',
        expectedTargetSpecialist: 'order_tracking',
        expectedWorkflowStatus: 'WAITING_FOR_USER_INPUT',
      },
      {
        userMessage: 'The order number is ord-118',
        expectedTargetSpecialist: 'order_tracking',
        expectedTools: [{ tool: 'get_order', gateOutcome: 'ALLOWED' }],
        expectedWorkflowStatus: 'COMPLETED',
      },
    ],
  },
  {
    id: 'SCENARIO-19',
    name: 'Payment status check on captured charge',
    description: 'VERIFIED customer views captured payment record and payment method via get_payment.',
    domain: 'payments',
    pattern: 'PATTERN_A',
    initialIdentity: { status: 'VERIFIED', verificationMethod: 'otp' },
    turns: [
      {
        userMessage: 'Can you show me the payment receipt for order ord-119?',
        expectedTargetSpecialist: 'payment',
        expectedTools: [{ tool: 'get_payment', gateOutcome: 'ALLOWED' }],
        expectedWorkflowStatus: 'COMPLETED',
        expectedResponseKeywords: ['captured', 'payment'],
      },
    ],
  },
  {
    id: 'SCENARIO-20',
    name: 'Duplicate charge inquiry with no duplicate confirmed',
    description: 'Customer suspects duplicate charge; detect_duplicate_charge confirms only one charge exists.',
    domain: 'payments',
    pattern: 'PATTERN_A',
    initialIdentity: { status: 'VERIFIED', verificationMethod: 'otp' },
    turns: [
      {
        userMessage: 'I think I was charged twice for ord-120.',
        expectedTargetSpecialist: 'payment',
        expectedTools: [{ tool: 'detect_duplicate_charge', gateOutcome: 'ALLOWED' }],
        expectedWorkflowStatus: 'COMPLETED',
        expectedResponseKeywords: ['single', 'one charge', 'no duplicate'],
      },
    ],
  },
  {
    id: 'SCENARIO-21',
    name: 'Refund status inquiry for completed refund',
    description: 'Customer inquires about refund status ref-121 using get_refund_status.',
    domain: 'payments',
    pattern: 'PATTERN_A',
    initialIdentity: { status: 'VERIFIED', verificationMethod: 'otp' },
    turns: [
      {
        userMessage: 'Has my refund ref-121 been sent to my bank?',
        expectedTargetSpecialist: 'refund',
        expectedTools: [{ tool: 'get_refund_status', gateOutcome: 'ALLOWED' }],
        expectedWorkflowStatus: 'COMPLETED',
        expectedResponseKeywords: ['refund', 'completed'],
      },
    ],
  },
  {
    id: 'SCENARIO-22',
    name: 'Direct refund creation for approved return without duplicate charges',
    description: 'VERIFIED customer with approved return requests refund; create_refund executes successfully.',
    domain: 'payments',
    pattern: 'PATTERN_A',
    initialIdentity: { status: 'VERIFIED', verificationMethod: 'otp' },
    turns: [
      {
        userMessage: 'Please issue my refund for order ord-122 with return ret-122.',
        expectedTargetSpecialist: 'refund',
        expectedTools: [{ tool: 'create_refund', gateOutcome: 'ALLOWED' }],
        expectedWorkflowStatus: 'COMPLETED',
        expectedResponseKeywords: ['refund', 'issued'],
      },
    ],
  },
  {
    id: 'SCENARIO-23',
    name: 'View customer profile while VERIFIED',
    description: 'VERIFIED customer views their account profile name and default address using get_profile.',
    domain: 'account',
    pattern: 'PATTERN_A',
    initialIdentity: { status: 'VERIFIED', verificationMethod: 'otp' },
    turns: [
      {
        userMessage: 'Show me my account profile and address.',
        expectedTargetSpecialist: 'profile',
        expectedTools: [{ tool: 'get_profile', gateOutcome: 'ALLOWED' }],
        expectedWorkflowStatus: 'COMPLETED',
        expectedResponseKeywords: ['profile', 'address'],
      },
    ],
  },
  {
    id: 'SCENARIO-24',
    name: 'Update customer address while VERIFIED',
    description: 'VERIFIED customer updates default delivery address using update_profile.',
    domain: 'account',
    pattern: 'PATTERN_A',
    initialIdentity: { status: 'VERIFIED', verificationMethod: 'otp' },
    turns: [
      {
        userMessage: 'Please change my default address to 789 New Boulevard.',
        expectedTargetSpecialist: 'profile',
        expectedTools: [{ tool: 'update_profile', gateOutcome: 'ALLOWED' }],
        expectedWorkflowStatus: 'COMPLETED',
        expectedResponseKeywords: ['updated', 'address'],
      },
    ],
  },
  {
    id: 'SCENARIO-25',
    name: 'Profile update blocked for UNVERIFIED customer -> routed to Account Access',
    description: 'Unverified user attempts profile update; gate blocks, routes to Account Access, then completes update.',
    domain: 'cross-domain',
    pattern: 'PATTERN_C',
    initialIdentity: { status: 'UNVERIFIED' },
    turns: [
      {
        userMessage: 'Update my profile name to Jane Doe.',
        expectedTargetSpecialist: 'profile',
        expectedWorkflowStatus: 'WAITING_FOR_USER_INPUT',
        expectedResponseKeywords: ['verify', 'identity'],
      },
      {
        userMessage: 'Verification code is 554433',
        expectedTargetSpecialist: 'account_access',
        expectedWorkflowStatus: 'COMPLETED',
        expectedTools: [{ tool: 'update_profile', gateOutcome: 'ALLOWED' }],
      },
    ],
  },
  {
    id: 'SCENARIO-26',
    name: 'Invalid OTP code submitted during verification flow',
    description: 'Customer enters invalid verification code; service increments attempts and prompts for retry.',
    domain: 'account',
    pattern: 'SAFETY_ESCALATION',
    initialIdentity: { status: 'UNVERIFIED' },
    turns: [
      {
        userMessage: 'My code is 000000',
        expectedTargetSpecialist: 'account_access',
        expectedWorkflowStatus: 'WAITING_FOR_USER_INPUT',
        expectedResponseKeywords: ['invalid', 'code', 'try again'],
      },
    ],
  },
  {
    id: 'SCENARIO-27',
    name: 'Password reset request with valid email format',
    description: 'Customer requests password reset; initiates reset safely without leaking existence or modifying status.',
    domain: 'account',
    pattern: 'SECURITY_BOUNDARY',
    turns: [
      {
        userMessage: 'I need to reset the password for customer@example.com.',
        expectedTargetSpecialist: 'account_access',
        expectedTools: [{ tool: 'initiate_password_reset', gateOutcome: 'ALLOWED' }],
        expectedWorkflowStatus: 'COMPLETED',
        expectedResponseKeywords: ['reset', 'email'],
      },
    ],
  },
  {
    id: 'SCENARIO-28',
    name: 'Order Tracking lateral handoff to Returns upon customer return request',
    description: 'Customer asking for order status changes mind and asks for return; Order Tracking hands off to Returns.',
    domain: 'cross-domain',
    pattern: 'PATTERN_B',
    initialIdentity: { status: 'LIGHTLY_VERIFIED', verificationMethod: 'order_number' },
    turns: [
      {
        userMessage: 'Where is my order ord-128?',
        expectedTargetSpecialist: 'order_tracking',
        expectedWorkflowStatus: 'COMPLETED',
      },
      {
        userMessage: 'I received it, but I would like to return it now.',
        expectedTargetSpecialist: 'returns',
        expectedWorkflowStatus: 'COMPLETED',
      },
    ],
  },
  {
    id: 'SCENARIO-29',
    name: 'Terminal ESCALATED state lock multi-turn enforcement',
    description: 'Once conversation is marked ESCALATED, subsequent customer turns stay locked in ESCALATED state.',
    domain: 'cross-domain',
    pattern: 'SAFETY_ESCALATION',
    turns: [
      {
        userMessage: 'Trigger escalation.',
        expectedWorkflowStatus: 'ESCALATED',
      },
      {
        userMessage: 'Are you still there?',
        expectedWorkflowStatus: 'ESCALATED',
        expectedResponseKeywords: ['representative', 'human'],
      },
    ],
  },
  {
    id: 'SCENARIO-30',
    name: 'Classifier fallback default to order_tracking on ambiguous gibberish',
    description: 'Customer sends unclassifiable input; router falls back safely to order_tracking without crashing.',
    domain: 'cross-domain',
    pattern: 'SAFETY_ESCALATION',
    turns: [
      {
        userMessage: 'asdfghjkl qwertyuiop ???',
        expectedTargetSpecialist: 'order_tracking',
        expectedWorkflowStatus: 'COMPLETED',
      },
    ],
  },
];

