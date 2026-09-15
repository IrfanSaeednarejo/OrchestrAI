import { z } from 'zod';
import { getUserById, updateUserProfile } from '../../persistence/repositories/marketplace.repository.js';
import { ToolResult, ToolMetadata } from '../types.js';
import { GetProfileOutput } from '../queries/profile.tools.js';

const uuidSchema = z.string().uuid();

export const UpdateProfileInputSchema = z.object({
  userId: uuidSchema,
  name: z.string().min(1).optional(),
  defaultAddress: z.string().min(1).optional(),
});

export type UpdateProfileInput = z.infer<typeof UpdateProfileInputSchema>;
export type UpdateProfileOutput = GetProfileOutput; // Same output shape as get_profile

export async function updateProfile(
  rawInput: unknown
): Promise<ToolResult<UpdateProfileOutput>> {
  const parsed = UpdateProfileInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      success: false,
      error: { code: 'INVALID_INPUT', message: parsed.error.message },
    };
  }

  const { userId, name, defaultAddress } = parsed.data;

  // "If neither name nor defaultAddress is provided, return INVALID_INPUT (nothing to update)."
  if (name === undefined && defaultAddress === undefined) {
    return {
      success: false,
      error: { code: 'INVALID_INPUT', message: 'Nothing to update: must provide name or defaultAddress.' },
    };
  }

  try {
    const user = await getUserById(userId);
    if (!user) {
      return {
        success: false,
        error: { code: 'NOT_FOUND', message: `User ${userId} not found.` },
      };
    }

    const fieldsToUpdate: { name?: string; defaultAddress?: string } = {};
    if (name !== undefined) fieldsToUpdate.name = name;
    if (defaultAddress !== undefined) fieldsToUpdate.defaultAddress = defaultAddress;

    const updatedUser = await updateUserProfile(userId, fieldsToUpdate);
    if (!updatedUser) {
      // Should logically not happen if getUserById succeeded, but safety first
      return {
        success: false,
        error: { code: 'NOT_FOUND', message: `User ${userId} not found during update.` },
      };
    }

    return { success: true, data: updatedUser };
  } catch (error) {
    return {
      success: false,
      error: { code: 'REPOSITORY_ERROR', message: error instanceof Error ? error.message : String(error) },
    };
  }
}

export const updateProfileMetadata: ToolMetadata = {
  name: 'update_profile',
  requiredVerification: 'FULL',
};
