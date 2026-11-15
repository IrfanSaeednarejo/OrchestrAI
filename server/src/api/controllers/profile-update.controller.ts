// src/api/controllers/profile-update.controller.ts
// Phase 26 Step 2: REST endpoint handlers for profile update + identity verification.
//
// POST /profile/update/request-code  — issue a 6-digit code and email it.
// POST /profile/update/verify        — validate code, apply conditional DB write.
// POST /profile/update/resend-code   — re-issue code (respects cooldown).

import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { db } from '../../persistence/db/client.js';
import { users } from '../../persistence/db/schema.js';
import { eq, and } from 'drizzle-orm';
import { getUserById } from '../../persistence/repositories/marketplace.repository.js';
import { sendEmail } from '../../services/email.service.js';
import { renderVerificationCodeEmail } from '../../services/email-templates/verification-code.js';
import {
  issueProfileVerificationCode,
  verifyProfileVerificationCode,
  resendProfileVerificationCode,
  recordDeliveryFailure,
  clearProfileVerification,
  VERIFICATION_TTL_SECONDS,
  FAILURE_COOLDOWN_SECONDS,
} from '../../services/profile-verification.service.js';
import { normalizeName, maskEmail } from '../../shared/normalization.js';
import { ValidationError, UnauthorizedError } from '../errors/app-error.js';
import type { User } from '../../persistence/repositories/marketplace.repository.js';

// ── Zod schemas ───────────────────────────────────────────────────────────────

const RequestCodeSchema = z
  .object({
    field: z.enum(['name', 'defaultAddress', 'both']),
    name: z.string().min(1).max(100).optional(),
    defaultAddress: z.string().min(1).max(300).optional(),
  })
  .superRefine((data, ctx) => {
    if ((data.field === 'name' || data.field === 'both') && !data.name) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "field 'name' requires a name value",
        path: ['name'],
      });
    }
    if ((data.field === 'defaultAddress' || data.field === 'both') && !data.defaultAddress) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "field 'defaultAddress' requires a defaultAddress value",
        path: ['defaultAddress'],
      });
    }
    // 'name' field: ignore/reject if defaultAddress is also supplied
    if (data.field === 'name' && data.defaultAddress !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "field 'name' cannot include defaultAddress; use field 'both' to update both",
        path: ['defaultAddress'],
      });
    }
    if (data.field === 'defaultAddress' && data.name !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "field 'defaultAddress' cannot include name; use field 'both' to update both",
        path: ['name'],
      });
    }
  });

const VerifySchema = z.object({
  code: z
    .string()
    .regex(/^\d{6}$/, 'code must be exactly 6 digits'),
});

// ── POST request-code ─────────────────────────────────────────────────────────

export async function handleRequestCode(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = req.user as User;
    if (!user) throw new UnauthorizedError('Authentication required');

    const parsed = RequestCodeSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid request', parsed.error.flatten().fieldErrors);
    }

    const { field, name: rawName, defaultAddress: rawAddress } = parsed.data;

    // Guard: no email on file
    if (!user.email) {
      res.status(200).json({ status: 'no_email' });
      return;
    }

    // Normalize requested values
    const normalizedName = field !== 'defaultAddress' && rawName
      ? normalizeName(rawName).normalized
      : undefined;
    const normalizedAddress = field !== 'name' && rawAddress
      ? rawAddress.trim().replace(/\s+/g, ' ')
      : undefined;

    // No-change guard: check whether the values already match the DB
    const freshUser = await getUserById(user.id);
    if (!freshUser) throw new UnauthorizedError('User account not found');

    const nameUnchanged =
      field !== 'defaultAddress' ? freshUser.name === normalizedName : true;
    const addressUnchanged =
      field !== 'name' ? freshUser.defaultAddress === normalizedAddress : true;

    if (nameUnchanged && addressUnchanged) {
      res.status(200).json({ status: 'no_change' });
      return;
    }

    // Build pending update payload (rawInput never logged/returned)
    const originalSnapshot = {
      name: freshUser.name,
      defaultAddress: freshUser.defaultAddress,
    };

    const issueResult = await issueProfileVerificationCode(freshUser.id, {
      field,
      name: normalizedName,
      defaultAddress: normalizedAddress,
      originalSnapshot,
      rawInput: {
        ...(rawName !== undefined ? { name: rawName } : {}),
        ...(rawAddress !== undefined ? { defaultAddress: rawAddress } : {}),
      },
    });

    if (!issueResult.success) {
      if (issueResult.error.code === 'RESEND_COOLDOWN') {
        res.status(429).json({
          status: 'cooldown',
          resend_after: issueResult.error.retryAfterSeconds,
          resend_at: issueResult.error.resendAt,
        });
        return;
      }
      // VERIFICATION_SERVICE_UNAVAILABLE
      res.status(503).json({ status: 'service_unavailable' });
      return;
    }

    // Send the email
    const { code, expiresAt, resendAt, resendAfter } = issueResult.data;
    const ttlMinutes = Math.round(VERIFICATION_TTL_SECONDS / 60);
    const emailContent = renderVerificationCodeEmail({
      name: freshUser.name,
      code,
      ttlMinutes,
    });

    const sendResult = await sendEmail({
      to: freshUser.email,
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text,
    });

    if (!sendResult.success) {
      await recordDeliveryFailure(freshUser.id);
      const maskedEmail = maskEmail(freshUser.email);
      res.status(200).json({
        status: 'failed',
        reason: sendResult.error.code,
        masked_email: maskedEmail,
        resend_after: FAILURE_COOLDOWN_SECONDS,
        resend_at: Date.now() + FAILURE_COOLDOWN_SECONDS * 1000,
      });
      return;
    }

    const maskedEmail = maskEmail(freshUser.email);
    res.status(200).json({
      status: 'sent',
      masked_email: maskedEmail,
      expires_at: expiresAt,
      resend_after: resendAfter,
      resend_at: resendAt,
    });
  } catch (err) {
    next(err);
  }
}

// ── POST verify ───────────────────────────────────────────────────────────────

export async function handleVerify(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = req.user as User;
    if (!user) throw new UnauthorizedError('Authentication required');

    const parsed = VerifySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid request', parsed.error.flatten().fieldErrors);
    }

    const { code } = parsed.data;
    const verifyResult = await verifyProfileVerificationCode(user.id, code);

    if (!verifyResult.success) {
      if (verifyResult.status === 'SERVICE_UNAVAILABLE') {
        res.status(503).json({ status: 'service_unavailable' });
        return;
      }

      if (verifyResult.status === 'INVALID') {
        res.status(200).json({
          status: 'invalid',
          remaining_attempts: verifyResult.remainingAttempts,
        });
        return;
      }

      if (verifyResult.status === 'TOO_MANY_ATTEMPTS') {
        res.status(200).json({ status: 'too_many_attempts' });
        return;
      }

      if (verifyResult.status === 'EXPIRED') {
        res.status(200).json({ status: 'expired' });
        return;
      }

      // NOT_FOUND | INVALID_STATE
      res.status(200).json({ status: 'not_found' });
      return;
    }

    // Code valid — apply conditional DB update (snapshot-based, OD-26e)
    const { pendingUpdates } = verifyResult.data;
    const { field, name: pendingName, defaultAddress: pendingAddress, originalSnapshot } = pendingUpdates;

    const setFields: { name?: string; defaultAddress?: string } = {};
    const updatedFields: string[] = [];

    if (field !== 'defaultAddress' && pendingName !== undefined) {
      setFields.name = pendingName;
      updatedFields.push('name');
    }
    if (field !== 'name' && pendingAddress !== undefined) {
      setFields.defaultAddress = pendingAddress;
      updatedFields.push('defaultAddress');
    }

    // Conditional update: WHERE id = :id AND name = :snapshot.name AND default_address = :snapshot.defaultAddress
    const updateResult = await db
      .update(users)
      .set(setFields)
      .where(
        and(
          eq(users.id, user.id),
          eq(users.name, originalSnapshot.name),
          eq(users.defaultAddress, originalSnapshot.defaultAddress),
        ),
      )
      .returning();

    if (updateResult.length === 0) {
      // 0 rows affected = concurrent edit conflict (OD-26e)
      await clearProfileVerification(user.id);
      res.status(200).json({ status: 'conflict' });
      return;
    }

    // Success — clean up Redis and return final stored values
    await clearProfileVerification(user.id);

    const updatedUser = updateResult[0] as NonNullable<typeof updateResult[0]>;
    res.status(200).json({
      status: 'ok',
      updated_fields: updatedFields,
      name: updatedUser.name,
      defaultAddress: updatedUser.defaultAddress,
    });
  } catch (err) {
    next(err);
  }
}

// ── POST resend-code ──────────────────────────────────────────────────────────

export async function handleResendCode(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = req.user as User;
    if (!user) throw new UnauthorizedError('Authentication required');

    const issueResult = await resendProfileVerificationCode(user.id);

    if (!issueResult.success) {
      if (issueResult.error.code === 'RESEND_COOLDOWN') {
        res.status(429).json({
          status: 'cooldown',
          resend_after: issueResult.error.retryAfterSeconds,
          resend_at: issueResult.error.resendAt,
        });
        return;
      }
      // NOT_FOUND or service unavailable
      res.status(503).json({ status: 'service_unavailable' });
      return;
    }

    // Re-send the email
    const freshUser = await getUserById(user.id);
    if (!freshUser?.email) {
      res.status(503).json({ status: 'service_unavailable' });
      return;
    }

    const { code, expiresAt, resendAt, resendAfter } = issueResult.data;
    const ttlMinutes = Math.round(VERIFICATION_TTL_SECONDS / 60);
    const emailContent = renderVerificationCodeEmail({
      name: freshUser.name,
      code,
      ttlMinutes,
    });

    const sendResult = await sendEmail({
      to: freshUser.email,
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text,
    });

    if (!sendResult.success) {
      await recordDeliveryFailure(freshUser.id);
      const maskedEmail = maskEmail(freshUser.email);
      res.status(200).json({
        status: 'failed',
        reason: sendResult.error.code,
        masked_email: maskedEmail,
        resend_after: FAILURE_COOLDOWN_SECONDS,
        resend_at: Date.now() + FAILURE_COOLDOWN_SECONDS * 1000,
      });
      return;
    }

    const maskedEmail = maskEmail(freshUser.email);
    res.status(200).json({
      status: 'sent',
      masked_email: maskedEmail,
      expires_at: expiresAt,
      resend_after: resendAfter,
      resend_at: resendAt,
    });
  } catch (err) {
    next(err);
  }
}
