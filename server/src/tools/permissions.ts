// src/tools/permissions.ts
export const TOOL_NAMES = [
  'get_order',
  'get_shipment_status',
  'get_return_status',
  'get_return_by_order',
  'check_return_eligibility',
  'create_return',
  'get_payment',
  'detect_duplicate_charge',
  'get_refund_status',
  'create_refund',
  'get_profile',
  'update_profile',
  'start_identity_verification',
  'verify_identity',
  'initiate_password_reset',
  'search_knowledge'
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

export const SPECIALIST_IDS = [
  'order_tracking',
  'returns',
  'payment',
  'refund',
  'profile',
  'account_access'
] as const;

export type SpecialistId = (typeof SPECIALIST_IDS)[number];

// This encodes the locked Tool/Specialist matrix and RAG Permission Matrix.
// Note that Profile has no knowledge access.
const allowlist: Record<SpecialistId, readonly ToolName[]> = {
  order_tracking: ['get_order', 'get_shipment_status', 'search_knowledge'],
  returns: ['get_order', 'get_shipment_status', 'check_return_eligibility', 'create_return', 'get_return_status', 'get_return_by_order', 'search_knowledge'],
  payment: ['get_order', 'get_payment', 'detect_duplicate_charge', 'search_knowledge'],
  refund: ['get_order', 'get_return_status', 'get_return_by_order', 'create_refund', 'get_refund_status', 'search_knowledge'],
  profile: ['get_profile', 'update_profile'],
  account_access: ['start_identity_verification', 'verify_identity', 'initiate_password_reset', 'search_knowledge']
};

export const TOOL_ALLOWLIST: Readonly<Record<SpecialistId, ReadonlySet<string>>> = {
  order_tracking: new Set(allowlist.order_tracking),
  returns: new Set(allowlist.returns),
  payment: new Set(allowlist.payment),
  refund: new Set(allowlist.refund),
  profile: new Set(allowlist.profile),
  account_access: new Set(allowlist.account_access),
};
