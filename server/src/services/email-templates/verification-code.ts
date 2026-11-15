// src/services/email-templates/verification-code.ts
// Verification code email template for account access verification.

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export interface VerificationCodeEmailInput {
  name: string;
  code: string;
  ttlMinutes: number;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export function renderVerificationCodeEmail(input: {
  name: string;
  code: string;
  ttlMinutes: number;
}): RenderedEmail {
  const { name, code, ttlMinutes } = input;

  // Programmer error assertion per specification
  if (!/^\d{6}$/.test(code)) {
    throw new Error(`Invalid verification code: "${code}". Code must be exactly 6 digits.`);
  }

  if (!Number.isInteger(ttlMinutes) || ttlMinutes <= 0) {
    throw new Error(`Invalid ttlMinutes: "${ttlMinutes}". Must be a positive integer.`);
  }

  const subject = 'Your OrchestrAI verification code';
  const safeName = escapeHtml(name);

  const text = [
    `Hello ${name},`,
    '',
    `Your OrchestrAI verification code is: ${code}`,
    '',
    `This code expires in ${ttlMinutes} minutes and can be used once.`,
    'Never share this code. OrchestrAI will never ask you for it.',
    '',
    "Didn't request this? You can safely ignore this email.",
    '',
    '— OrchestrAI Support',
  ].join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verification Code</title>
</head>
<body style="margin: 0; padding: 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width: 100%; max-width: 480px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
    <tr>
      <td style="padding: 32px 28px;">
        <h2 style="margin: 0 0 16px; font-size: 20px; font-weight: 600; color: #0f172a;">OrchestrAI Verification</h2>
        <p style="margin: 0 0 16px; font-size: 15px; line-height: 24px; color: #334155;">Hello ${safeName},</p>
        <p style="margin: 0 0 24px; font-size: 15px; line-height: 24px; color: #334155;">Please use the following verification code to confirm your identity with OrchestrAI:</p>
        
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width: 100%; margin: 0 0 24px; background-color: #f1f5f9; border-radius: 6px;">
          <tr>
            <td style="padding: 16px; text-align: center;">
              <span style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 32px; font-weight: 700; letter-spacing: 6px; color: #0f172a;">${code}</span>
            </td>
          </tr>
        </table>

        <p style="margin: 0 0 12px; font-size: 14px; line-height: 20px; color: #64748b;">
          This code expires in <strong>${ttlMinutes} minutes</strong> and can be used once.
        </p>
        <p style="margin: 0 0 24px; font-size: 14px; line-height: 20px; color: #64748b;">
          <strong>Never share this code.</strong> OrchestrAI will never ask you for it.
        </p>
        
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        
        <p style="margin: 0; font-size: 13px; line-height: 18px; color: #94a3b8;">
          Didn't request this? You can safely ignore this email.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html, text };
}

