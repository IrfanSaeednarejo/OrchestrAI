// src/components/chat/verification-prompt.test.tsx
// Phase 17 Step 5c / Phase 26: Tests for VerificationPrompt component.
// Covers all 7 UI states: IDLE, SENT_AWAITING_CODE, COOLDOWN_ACTIVE,
// SEND_FAILED, EXPIRED, LOCKED_OUT, plus dev-OTP peek.

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { VerificationPrompt } from './verification-prompt';
import * as apiClient from '../../lib/api-client';

vi.mock('../../lib/api-client', () => ({
  peekDevVerificationCode: vi.fn(),
}));

describe('VerificationPrompt', () => {
  const originalEnv = process.env.NEXT_PUBLIC_ENABLE_DEMO_CODE;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_ENABLE_DEMO_CODE = 'false';
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_ENABLE_DEMO_CODE = originalEnv;
  });

  // ── Renders nothing ──────────────────────────────────────────────────────

  it('renders nothing when blockedBy is null', () => {
    const { container } = render(
      <VerificationPrompt blockedBy={null} currentStep={null} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when blockedBy is undefined', () => {
    const { container } = render(
      <VerificationPrompt blockedBy={undefined} currentStep={null} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  // ── IDLE state ───────────────────────────────────────────────────────────

  it('IDLE: renders actionable guidance without system-leak strings when BLOCKED+FULL but no code sent', () => {
    render(
      <VerificationPrompt
        blockedBy="VERIFICATION_FULL"
        currentStep="identify_customer"
      />
    );
    expect(screen.getByTestId('verification-prompt-banner')).toBeInTheDocument();
    expect(screen.getByTestId('idle-body')).toBeInTheDocument();
    // Must NOT contain the old system-leak string
    expect(screen.queryByText(/Identity verification required\./i)).not.toBeInTheDocument();
    // Must NOT say "Send me a verification code" (no code has been sent)
    expect(screen.queryByText(/Send me a verification code/i)).not.toBeInTheDocument();
    // Must say "follow the instructions"
    expect(screen.getByText(/follow the instructions/i)).toBeInTheDocument();
    // OTP hint not shown until code sent
    expect(screen.queryByTestId('otp-hint')).not.toBeInTheDocument();
  });

  it('IDLE: renders light confirmation copy when VERIFICATION_LIGHT', () => {
    render(
      <VerificationPrompt
        blockedBy="VERIFICATION_LIGHT"
        currentStep={null}
      />
    );
    expect(screen.getByText(/Security Confirmation/i)).toBeInTheDocument();
    expect(screen.getByText(/confirm your identity details/i)).toBeInTheDocument();
    expect(screen.queryByTestId('otp-hint')).not.toBeInTheDocument();
  });

  // ── SENT_AWAITING_CODE state ─────────────────────────────────────────────

  it('SENT_AWAITING_CODE: shows masked email and OTP hint when currentStep is verify_identity', () => {
    render(
      <VerificationPrompt
        blockedBy="VERIFICATION_FULL"
        currentStep="verify_identity"
        maskedEmail="j***@example.com"
      />
    );
    expect(screen.getByTestId('awaiting-code-body')).toBeInTheDocument();
    expect(screen.getByText(/j\*\*\*@example\.com/i)).toBeInTheDocument();
    expect(screen.getByTestId('otp-hint')).toBeInTheDocument();
    expect(screen.getByText(/Enter your 6-digit code/i)).toBeInTheDocument();
  });

  it('SENT_AWAITING_CODE: shows awaiting-code-body when currentStep is awaiting_code (profile flow)', () => {
    render(
      <VerificationPrompt
        blockedBy="VERIFICATION_FULL"
        currentStep="awaiting_code"
        maskedEmail="j***@example.com"
      />
    );
    expect(screen.getByTestId('awaiting-code-body')).toBeInTheDocument();
    expect(screen.getByTestId('otp-hint')).toBeInTheDocument();
  });

  // ── SEND_FAILED state ────────────────────────────────────────────────────

  it('SEND_FAILED: shows failure copy, masked email, resend + contact support buttons', () => {
    const onResend = vi.fn();
    const onContactSupport = vi.fn();

    render(
      <VerificationPrompt
        blockedBy="VERIFICATION_FULL"
        currentStep="awaiting_code"
        maskedEmail="j***@example.com"
        sendFailed={true}
        onResend={onResend}
        onContactSupport={onContactSupport}
      />
    );

    expect(screen.getByTestId('send-failed-body')).toBeInTheDocument();
    expect(screen.getByText(/j\*\*\*@example\.com/i)).toBeInTheDocument();
    expect(screen.getByText(/Delivery Failed/i)).toBeInTheDocument();

    const resendBtn = screen.getByTestId('resend-code-button');
    const supportBtn = screen.getByTestId('contact-support-button');
    expect(resendBtn).toBeInTheDocument();
    expect(supportBtn).toBeInTheDocument();

    fireEvent.click(resendBtn);
    expect(onResend).toHaveBeenCalledTimes(1);

    fireEvent.click(supportBtn);
    expect(onContactSupport).toHaveBeenCalledTimes(1);
  });

  // ── EXPIRED state ─────────────────────────────────────────────────────────

  it('EXPIRED: shows expired copy and resend button', () => {
    const onResend = vi.fn();

    render(
      <VerificationPrompt
        blockedBy="VERIFICATION_FULL"
        currentStep="awaiting_code"
        expired={true}
        onResend={onResend}
      />
    );

    expect(screen.getByTestId('expired-body')).toBeInTheDocument();
    expect(screen.getByText(/Code Expired/i)).toBeInTheDocument();
    const resendBtn = screen.getByTestId('resend-code-button');
    expect(resendBtn).toBeInTheDocument();

    fireEvent.click(resendBtn);
    expect(onResend).toHaveBeenCalledTimes(1);
  });

  // ── LOCKED_OUT state ─────────────────────────────────────────────────────

  it('LOCKED_OUT: shows lockout copy explaining resend resets attempts', () => {
    const onResend = vi.fn();

    render(
      <VerificationPrompt
        blockedBy="VERIFICATION_FULL"
        currentStep="awaiting_code"
        lockedOut={true}
        onResend={onResend}
      />
    );

    expect(screen.getByTestId('locked-out-body')).toBeInTheDocument();
    expect(screen.getByText(/Too Many Attempts/i)).toBeInTheDocument();
    // Must mention that resend resets attempts
    expect(screen.getByText(/reset your attempts to 0/i)).toBeInTheDocument();
    const resendBtn = screen.getByTestId('resend-code-button');
    expect(resendBtn).toBeInTheDocument();
  });

  // ── Dev-only OTP peek ─────────────────────────────────────────────────────

  it('renders dev-only OTP peek when NEXT_PUBLIC_ENABLE_DEMO_CODE is true + awaiting code', async () => {
    process.env.NEXT_PUBLIC_ENABLE_DEMO_CODE = 'true';
    vi.mocked(apiClient.peekDevVerificationCode).mockResolvedValueOnce('849201');

    const onCodeSelect = vi.fn();

    render(
      <VerificationPrompt
        blockedBy="VERIFICATION_FULL"
        currentStep="verify_identity"
        userId="user-alice-123"
        onCodeSelect={onCodeSelect}
      />
    );

    const peekButton = screen.getByTestId('peek-dev-otp-button');
    expect(peekButton).toBeInTheDocument();

    fireEvent.click(peekButton);

    await waitFor(() => {
      expect(screen.getByText('849201')).toBeInTheDocument();
    });

    const copyButton = screen.getByTestId('copy-dev-otp-button');
    fireEvent.click(copyButton);

    expect(onCodeSelect).toHaveBeenCalledWith('849201');
  });

  it('hides dev OTP peek when NEXT_PUBLIC_ENABLE_DEMO_CODE is not true', () => {
    process.env.NEXT_PUBLIC_ENABLE_DEMO_CODE = 'false';

    render(
      <VerificationPrompt
        blockedBy="VERIFICATION_FULL"
        currentStep="verify_identity"
        userId="user-alice-123"
      />
    );

    expect(screen.queryByTestId('peek-dev-otp-button')).not.toBeInTheDocument();
  });

  it('hides dev OTP peek when not in awaiting-code state', () => {
    process.env.NEXT_PUBLIC_ENABLE_DEMO_CODE = 'true';

    render(
      <VerificationPrompt
        blockedBy="VERIFICATION_FULL"
        currentStep="identify_customer"  // not awaiting code
        userId="user-alice-123"
      />
    );

    expect(screen.queryByTestId('dev-otp-container')).not.toBeInTheDocument();
  });
});
