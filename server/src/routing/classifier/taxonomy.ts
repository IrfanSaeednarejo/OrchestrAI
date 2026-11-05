// src/routing/classifier/taxonomy.ts
// Phase 8: Taxonomy of recognized intents mapped to specialist agents.
// Used by the LLM routing classifier to ground routing decisions.

import { type SpecialistId } from '../../tools/permissions.js';

export const ORDER_TRACKING_INTENTS = [
  'ORDER_STATUS',
  'SHIPMENT_STATUS',
  'ORDER_HISTORY',
] as const;

export const RETURNS_INTENTS = [
  'RETURN_REQUEST',
  'RETURN_STATUS',
  'RETURN_ELIGIBILITY',
] as const;

export const PAYMENT_INTENTS = [
  'PAYMENT_INQUIRY',
  'PAYMENT_ISSUE',
  'DUPLICATE_CHARGE',
] as const;

export const REFUND_INTENTS = [
  'REFUND_REQUEST',
  'REFUND_STATUS',
] as const;

export const PROFILE_INTENTS = [
  'VIEW_PROFILE',
  'UPDATE_PROFILE',
] as const;

export const ACCOUNT_ACCESS_INTENTS = [
  'PASSWORD_RESET',
  'VERIFY_ACCOUNT',
  'LOGIN_ISSUE',
] as const;

export const ALL_INTENTS = [
  ...ORDER_TRACKING_INTENTS,
  ...RETURNS_INTENTS,
  ...PAYMENT_INTENTS,
  ...REFUND_INTENTS,
  ...PROFILE_INTENTS,
  ...ACCOUNT_ACCESS_INTENTS,
  'GENERAL_INQUIRY',
  'UNKNOWN',
] as const;

export type RecognizedIntent = (typeof ALL_INTENTS)[number];

export const INTENT_SPECIALIST_MAP: Record<RecognizedIntent, SpecialistId> = {
  ORDER_STATUS: 'order_tracking',
  SHIPMENT_STATUS: 'order_tracking',
  ORDER_HISTORY: 'order_tracking',
  RETURN_REQUEST: 'returns',
  RETURN_STATUS: 'returns',
  RETURN_ELIGIBILITY: 'returns',
  PAYMENT_INQUIRY: 'payment',
  PAYMENT_ISSUE: 'payment',
  DUPLICATE_CHARGE: 'payment',
  REFUND_REQUEST: 'refund',
  REFUND_STATUS: 'refund',
  VIEW_PROFILE: 'profile',
  UPDATE_PROFILE: 'profile',
  PASSWORD_RESET: 'account_access',
  VERIFY_ACCOUNT: 'account_access',
  LOGIN_ISSUE: 'account_access',
  GENERAL_INQUIRY: 'order_tracking', // default fallback for general store queries
  UNKNOWN: 'order_tracking',
};

export function getSpecialistForIntent(intent: RecognizedIntent): SpecialistId {
  return INTENT_SPECIALIST_MAP[intent];
}

export function isValidSpecialistId(id: string): id is SpecialistId {
  return (
    id === 'order_tracking' ||
    id === 'returns' ||
    id === 'payment' ||
    id === 'refund' ||
    id === 'profile' ||
    id === 'account_access'
  );
}
