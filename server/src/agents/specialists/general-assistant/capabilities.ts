// src/agents/specialists/general-assistant/capabilities.ts
// Phase 24: Capabilities registry for OrchestrAI e-commerce customer support platform.
// Grounding source for general assistant triage, capability inquiries, and suggestions.

export interface PlatformCapability {
  id: string;
  name: string;
  description: string;
  exampleQueries: string[];
}

export const PLATFORM_CAPABILITIES: readonly PlatformCapability[] = [
  {
    id: 'order_tracking',
    name: 'Order Tracking & Delivery',
    description: 'Look up real-time order status, carrier information, tracking numbers, and estimated delivery dates.',
    exampleQueries: ['Where is my package?', 'Track order <id>', 'When will my order arrive?'],
  },
  {
    id: 'returns',
    name: 'Returns & Eligibility',
    description: 'Check return window eligibility (30-day policy), submit return requests, get shipping labels, and check return status.',
    exampleQueries: ['Can I return this item?', 'I want to return order <id>', 'What is your return policy?'],
  },
  {
    id: 'payment',
    name: 'Payments & Billing Disputes',
    description: 'Inspect payment status, investigate duplicate charges, and resolve payment method issues.',
    exampleQueries: ['Was my card charged twice?', 'Check payment status for order <id>'],
  },
  {
    id: 'refund',
    name: 'Refunds & Status',
    description: 'Track refund processing status, refund amounts, and expected settlement timelines.',
    exampleQueries: ['Where is my refund?', 'How long do refunds take?'],
  },
  {
    id: 'profile',
    name: 'Profile & Address Management',
    description: 'View your profile information and update your default delivery address or contact name.',
    exampleQueries: ['Update my shipping address', 'Change my name on my profile'],
  },
  {
    id: 'account_access',
    name: 'Account Security & Verification',
    description: 'Reset forgotten passwords, verify identity via 6-digit email OTP codes, and troubleshoot sign-in issues.',
    exampleQueries: ['I forgot my password', 'Verify my identity', 'Help me log in'],
  },
];

/**
 * Returns a concise formatted markdown summary of platform capabilities
 * to ground general assistant responses.
 */
export function formatCapabilitiesForPrompt(): string {
  return PLATFORM_CAPABILITIES.map(
    (c) => `- **${c.name}**: ${c.description} (e.g., "${c.exampleQueries[0]}")`
  ).join('\n');
}

