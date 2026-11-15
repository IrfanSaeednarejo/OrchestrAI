// src/services/email-smoke.ts
// Manual smoke script to test real Resend delivery.
// Usage: tsx src/services/email-smoke.ts <recipient@example.com>

import { sendEmail } from './email.service.js';
import { renderVerificationCodeEmail } from './email-templates/verification-code.js';
import { config } from '../shared/config.js';

async function main() {
  const recipient = process.argv[2];
  if (!recipient) {
    console.error('Usage: tsx src/services/email-smoke.ts <recipient-email>');
    process.exit(1);
  }

  console.log(`[Smoke] Testing email delivery to: ${recipient}`);

  // Force dryRun off for this manual smoke script
  (config.email as { dryRun: boolean }).dryRun = false;

  const rendered = renderVerificationCodeEmail({
    name: 'Smoke Test User',
    code: '123456',
    ttlMinutes: 10,
  });

  const result = await sendEmail({
    to: recipient,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });

  if (result.success) {
    console.log(`[Smoke] Success! Message ID: ${result.data.messageId}`);
    process.exit(0);
  } else {
    console.error(`[Smoke] Failed: [${result.error.code}] ${result.error.message}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[Smoke] Unexpected error:', err);
  process.exit(1);
});

