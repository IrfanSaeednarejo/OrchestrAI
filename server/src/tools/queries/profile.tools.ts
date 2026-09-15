import { z } from 'zod';
import { getUserById } from '../../persistence/repositories/marketplace.repository.js';
import { ToolResult, ToolMetadata } from '../types.js';

const uuidSchema = z.string().uuid();

export const GetProfileInputSchema = z.object({
  userId: uuidSchema,
});

export const GetProfileOutputSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  defaultAddress: z.string(),
  createdAt: z.date(),
});

export type GetProfileInput = z.infer<typeof GetProfileInputSchema>;
export type GetProfileOutput = z.infer<typeof GetProfileOutputSchema>;

export async function getProfile(
  rawInput: unknown
): Promise<ToolResult<GetProfileOutput>> {
  const parsed = GetProfileInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      success: false,
      error: { code: 'INVALID_INPUT', message: parsed.error.message },
    };
  }

  try {
    const user = await getUserById(parsed.data.userId);
    if (!user) {
      return {
        success: false,
        error: { code: 'NOT_FOUND', message: `User ${parsed.data.userId} not found.` },
      };
    }

    return { success: true, data: user };
  } catch (error) {
    return {
      success: false,
      error: { code: 'REPOSITORY_ERROR', message: error instanceof Error ? error.message : String(error) },
    };
  }
}

export const getProfileMetadata: ToolMetadata = {
  name: 'get_profile',
  requiredVerification: 'FULL',
};
