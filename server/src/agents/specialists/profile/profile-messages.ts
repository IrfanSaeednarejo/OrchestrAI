// src/agents/specialists/profile/profile-messages.ts
// Phase 26 Step 4: Centralized message constants for the profile update flow.
// No system-leak strings. All copy is here; profile.ts references these constants only.

export const MESSAGES = {
  ASK_WHAT_TO_CHANGE:
    "I'd be happy to help you update your profile. What would you like to change — your name, your default shipping address, or both?",

  ASK_FOR_NAME:
    "What new name would you like to set on your profile?",

  ASK_FOR_ADDRESS:
    "What new default shipping address would you like to set?",

  CONFIRM_CHANGE: (normalized: string, raw: string, field: string): string => {
    const rawNote =
      raw.trim() !== normalized ? ` (you wrote "${raw.trim()}", we'll store it as "${normalized}")` : '';
    return `Just to confirm — you'd like to update your ${field} to **${normalized}**${rawNote}. Is that correct? (Reply "yes" to continue, or tell me the correct value.)`;
  },

  NO_EMAIL_ON_FILE:
    "I'm not able to send a verification code because there's no email address on your account. Please contact support to add an email before making profile changes.",

  CODE_SENDING:
    "One moment — sending your verification code now…",

  CODE_SENT: (maskedEmail: string, ttlMinutes: number, cooldownSeconds: number): string =>
    `A 6-digit verification code has been sent to **${maskedEmail}**. ` +
    `It's valid for ${ttlMinutes} minutes. ` +
    `Please enter the code below.\n\n` +
    `_Didn't get it? Check your spam folder. You can request a new code in ${cooldownSeconds} seconds._`,

  COOLDOWN_ACTIVE: (seconds: number): string =>
    `Your previous code is still active. You can request a new code in ${seconds} seconds. ` +
    `Please check your inbox (including spam) for the code that was already sent.`,

  SEND_FAILED: (maskedEmail: string, cooldownSeconds: number): string =>
    `I wasn't able to deliver the verification email to **${maskedEmail}**. ` +
    `This can happen when the mail provider is temporarily unavailable.\n\n` +
    `You can try again in ${cooldownSeconds} seconds. If the problem persists, please contact support.`,

  ENTER_CODE_PROMPT:
    "Please enter your 6-digit verification code.",

  CODE_INVALID: (remaining: number): string =>
    `That code doesn't match. You have ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining. Please check the code and try again.`,

  CODE_EXPIRED:
    "Your verification code has expired. I'll send you a fresh code now.",

  TOO_MANY_ATTEMPTS:
    "You've used all 5 attempts for this code. I'll send you a fresh code — please wait a moment.",

  UPDATE_SUCCESS: (name: string, defaultAddress: string, updatedFields: string[]): string => {
    return (
      `Your profile has been updated successfully. Here's what changed:\n\n` +
      (updatedFields.includes('name') ? `- **Name:** ${name}\n` : '') +
      (updatedFields.includes('defaultAddress') ? `- **Default address:** ${defaultAddress}\n` : '') +
      `\nIs there anything else I can help you with?`
    );
  },

  CONFLICT:
    "Your profile was updated by another session while we were verifying your identity. Please start the update process again so we're working from the latest information.",

  SERVICE_UNAVAILABLE:
    "The verification service is temporarily unavailable. Please try again in a few moments. If the problem persists, please contact support.",

  NOT_FOUND:
    "I couldn't find an active verification session. Please start the update process again.",
} as const;
