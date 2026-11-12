// src/services/email.service.ts
// Resend email delivery service with validation, timeout guard, dry-run mode, and privacy-preserving logging.

import { z } from 'zod';
import { Resend } from 'resend';
import { config } from '../shared/config.js';

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export type EmailErrorCode = 'EMAIL_INVALID_INPUT' | 'EMAIL_SEND_FAILED' | 'EMAIL_TIMEOUT';

export type EmailResult =
  | { success: true; data: { messageId: string } }
  | { success: false; error: { code: EmailErrorCode; message: string } };

const EmailMessageSchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1),
  html: z.string().min(1),
  text: z.string().min(1),
});

let resendClient: Resend | null = null;

function getResendClient(): Resend {
  if (!resendClient) {
    resendClient = new Resend(config.email.apiKey);
  }
  return resendClient;
}

/**
 * Extracts only the domain part from an email address for safe logging.
 */
function extractDomain(email: string): string {
  const parts = email.split('@');
  return parts.length === 2 && parts[1] ? parts[1].toLowerCase() : 'unknown-domain';
}

/**
 * Sends an email using Resend.
 * Enforces an 8-second timeout, input validation, dry-run support, and privacy-preserving logging.
 * Never throws.
 */
export async function sendEmail(message: EmailMessage): Promise<EmailResult> {
  const validation = EmailMessageSchema.safeParse(message);
  if (!validation.success) {
    return {
      success: false,
      error: {
        code: 'EMAIL_INVALID_INPUT',
        message: validation.error.issues.map((i) => i.message).join('; '),
      },
    };
  }

  const { to, subject, html, text } = validation.data;
  const recipientDomain = extractDomain(to);

  // Dry-run mode: do not call external API
  if (config.email.dryRun) {
    const dryRunId = 'dry-run';
    console.log(`[EmailService] Dry-run email sent to domain @${recipientDomain} (messageId: ${dryRunId})`);
    return {
      success: true,
      data: { messageId: dryRunId },
    };
  }

  try {
    const resend = getResendClient();

    const sendPromise = resend.emails.send({
      from: config.email.from,
      to,
      subject,
      html,
      text,
    });

    const timeoutPromise = new Promise<{ isTimeout: true }>((resolve) =>
      setTimeout(() => resolve({ isTimeout: true }), 8000)
    );

    const raceResult = await Promise.race([sendPromise, timeoutPromise]);

    if ('isTimeout' in raceResult && raceResult.isTimeout) {
      console.warn(`[EmailService] Send timed out for domain @${recipientDomain}`);
      return {
        success: false,
        error: {
          code: 'EMAIL_TIMEOUT',
          message: 'Email sending timed out after 8 seconds',
        },
      };
    }

    const { data, error } = raceResult as {
      data: { id: string } | null;
      error: { message: string; name?: string } | null;
    };

    if (error || !data?.id) {
      const errorMsg = error?.message || 'Unknown provider error';
      console.error(`[EmailService] Provider failed for domain @${recipientDomain}: ${errorMsg}`);
      return {
        success: false,
        error: {
          code: 'EMAIL_SEND_FAILED',
          message: errorMsg,
        },
      };
    }

    console.log(`[EmailService] Email dispatched to domain @${recipientDomain} (messageId: ${data.id})`);
    return {
      success: true,
      data: { messageId: data.id },
    };
  } catch (err) {
    const errMessage = err instanceof Error ? err.message : String(err);
    console.error(`[EmailService] Unexpected failure for domain @${recipientDomain}: ${errMessage}`);
    return {
      success: false,
      error: {
        code: 'EMAIL_SEND_FAILED',
        message: errMessage,
      },
    };
  }
}

