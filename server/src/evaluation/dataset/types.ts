import { z } from 'zod';
import { SPECIALIST_IDS, type SpecialistId } from '../../tools/permissions.js';

export const SpecialistIdEnum = z.enum(
  SPECIALIST_IDS as unknown as [SpecialistId, ...SpecialistId[]]
);

export const ExpectedEvaluatorOutcomeSchema = z.object({
  routingCorrect: z.boolean().default(true),
  handoffCorrect: z.boolean().default(true),
  specialistScopeCorrect: z.boolean().default(true),
  toolSelectionCorrect: z.boolean().default(true),
  statePreserved: z.boolean().default(true),
  knowledgeGrounded: z.boolean().default(true),
  workflowCompleted: z.boolean().default(true),
  resolutionCorrect: z.boolean().default(true),
});
export type ExpectedEvaluatorOutcome = z.infer<typeof ExpectedEvaluatorOutcomeSchema>;

export const ExpectedToolCallSchema = z.object({
  tool: z.string(),
  argsMatch: z.record(z.string(), z.unknown()).optional(),
  gateOutcome: z.enum(['ALLOWED', 'BLOCKED', 'DENIED']).optional(),
});
export type ExpectedToolCall = z.infer<typeof ExpectedToolCallSchema>;

export const ScenarioTurnSchema = z.object({
  userMessage: z.string(),
  expectedTargetSpecialist: SpecialistIdEnum.optional(),
  expectedIntent: z.string().optional(),
  expectedWorkflowStatus: z
    .enum(['ACTIVE', 'WAITING_FOR_USER_INPUT', 'BLOCKED', 'COMPLETED', 'ESCALATED', 'FAILED'])
    .optional(),
  expectedTools: z.array(ExpectedToolCallSchema).optional(),
  expectedHandoff: z
    .object({
      sourceAgent: SpecialistIdEnum,
      targetAgent: SpecialistIdEnum,
    })
    .optional(),
  expectedResponseKeywords: z.array(z.string()).optional(),
  expectedResponseNegativeKeywords: z.array(z.string()).optional(),
});
export type ScenarioTurn = z.infer<typeof ScenarioTurnSchema>;

export const ScenarioDomainSchema = z.enum(['orders', 'payments', 'account', 'cross-domain']);
export type ScenarioDomain = z.infer<typeof ScenarioDomainSchema>;

export const ScenarioPatternSchema = z.enum([
  'PATTERN_A',
  'PATTERN_B',
  'PATTERN_C',
  'SAFETY_ESCALATION',
  'SECURITY_BOUNDARY',
]);
export type ScenarioPattern = z.infer<typeof ScenarioPatternSchema>;

export const EvaluationScenarioSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  domain: ScenarioDomainSchema,
  pattern: ScenarioPatternSchema,
  initialIdentity: z
    .object({
      status: z.enum(['UNVERIFIED', 'LIGHTLY_VERIFIED', 'VERIFIED']),
      verificationMethod: z.string().optional(),
      verifiedAt: z.string().optional(),
    })
    .optional(),
  turns: z.array(ScenarioTurnSchema).min(1),
  expectedEvaluators: ExpectedEvaluatorOutcomeSchema.optional(),
});
export type EvaluationScenario = z.infer<typeof EvaluationScenarioSchema>;
