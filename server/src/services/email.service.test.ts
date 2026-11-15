// src/services/email.service.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock resend SDK BEFORE any import that loads it
// ---------------------------------------------------------------------------
const mockSend = vi.hoisted(() => vi.fn());

vi.mock('resend', () => {
  return {
    Resend: class {
      emails = {
        send: mockSend,
      };
    },
  };
});

import { sendEmail, type EmailMessage } from './email.service.js';
import { config } from '../shared/config.js';

describe('Email Service', () => {
  const sampleMessage: EmailMessage = {
    to: 'customer@example.com',
    subject: 'Verification Code',
    html: '<p>Your code is 123456</p>',
    text: 'Your code is 123456',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Default config: real mode (dryRun false) for unit test verification of Resend SDK calls
    (config.email as { dryRun: boolean }).dryRun = false;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('success returns messageId', async () => {
    mockSend.mockResolvedValueOnce({
      data: { id: 'msg_resend_12345' },
      error: null,
    });

    const result = await sendEmail(sampleMessage);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.messageId).toBe('msg_resend_12345');
    }
  });

  it('from, to, subject, html, text are passed through correctly to SDK', async () => {
    mockSend.mockResolvedValueOnce({
      data: { id: 'msg_passthrough_test' },
      error: null,
    });

    await sendEmail(sampleMessage);

    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend).toHaveBeenCalledWith({
      from: config.email.from,
      to: 'customer@example.com',
      subject: 'Verification Code',
      html: '<p>Your code is 123456</p>',
      text: 'Your code is 123456',
    });
  });

  it('Resend returns { error } -> EMAIL_SEND_FAILED', async () => {
    mockSend.mockResolvedValueOnce({
      data: null,
      error: { message: 'Domain not verified', name: 'validation_error' },
    });

    const result = await sendEmail(sampleMessage);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('EMAIL_SEND_FAILED');
      expect(result.error.message).toContain('Domain not verified');
    }
  });

  it('SDK throws unexpected exception -> EMAIL_SEND_FAILED (never throws)', async () => {
    mockSend.mockRejectedValueOnce(new Error('Network connection aborted'));

    const result = await sendEmail(sampleMessage);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('EMAIL_SEND_FAILED');
      expect(result.error.message).toContain('Network connection aborted');
    }
  });

  it('hangs past timeout -> EMAIL_TIMEOUT via fake timers', async () => {
    vi.useFakeTimers();

    // Hang send call indefinitely
    mockSend.mockReturnValueOnce(new Promise(() => {}));

    const sendPromise = sendEmail(sampleMessage);

    // Fast forward 8000 ms to trigger the timeout
    await vi.advanceTimersByTimeAsync(8000);

    const result = await sendPromise;

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('EMAIL_TIMEOUT');
      expect(result.error.message).toContain('timed out');
    }

    vi.useRealTimers();
  });

  it('invalid recipient email -> EMAIL_INVALID_INPUT and SDK is not called', async () => {
    const invalidMessage: EmailMessage = {
      to: 'not-an-email',
      subject: 'Valid Subject',
      html: '<p>Hello</p>',
      text: 'Hello',
    };

    const result = await sendEmail(invalidMessage);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('EMAIL_INVALID_INPUT');
    }
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('dryRun mode -> SDK not called and returns messageId "dry-run"', async () => {
    (config.email as { dryRun: boolean }).dryRun = true;

    const result = await sendEmail(sampleMessage);

    expect(mockSend).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.messageId).toBe('dry-run');
    }
  });

  it('console output never logs subject or body content', async () => {
    mockSend.mockResolvedValueOnce({
      data: { id: 'msg_privacy_test' },
      error: null,
    });

    const secretSubject = 'Super Secret Subject 9876';
    const secretContent = 'Secret Body OTP 54321';

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await sendEmail({
      to: 'privacy.test@acmecorp.com',
      subject: secretSubject,
      html: `<p>${secretContent}</p>`,
      text: secretContent,
    });

    const allLogged = [
      ...logSpy.mock.calls.flat(),
      ...errorSpy.mock.calls.flat(),
      ...warnSpy.mock.calls.flat(),
    ].join(' ');

    expect(allLogged).not.toContain(secretSubject);
    expect(allLogged).not.toContain(secretContent);
    expect(allLogged).not.toContain('privacy.test@'); // full recipient local-part not logged
    expect(allLogged).toContain('acmecorp.com'); // recipient domain logged
  });
});

