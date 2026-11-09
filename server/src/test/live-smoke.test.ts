// src/test/live-smoke.test.ts
// Phase 23 Step 7: Live smoke test for Gemini API connectivity.
// Opt-in only: runs ONLY when process.env.RUN_LIVE_GEMINI_SMOKE === 'true'.
// Standard CI / test runs skip this completely to prevent network calls and costs.

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { generateStructuredOutput } from '../agents/llm/client.js';

const isLiveSmokeEnabled = process.env.RUN_LIVE_GEMINI_SMOKE === 'true';

describe.skipIf(!isLiveSmokeEnabled)('Live Gemini Smoke Test (Opt-In)', () => {
  it('successfully contacts the live Gemini model and returns structured response', async () => {
    const SmokeSchema = z.object({
      status: z.string(),
      modelReady: z.boolean(),
    });

    const prompt = 'Respond in JSON with status "READY" and modelReady true.';
    const result = await generateStructuredOutput(SmokeSchema, prompt, {
      temperature: 0,
      maxOutputTokens: 50,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('READY');
      expect(result.data.modelReady).toBe(true);
    }
  }, 15000);
});
