// src/components/chat/verification-prompt.test.tsx
// Phase 17 Step 5c: Tests for VerificationPrompt component.

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
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_ENABLE_DEMO_CODE = originalEnv;
  });

  it('renders nothing when blockedBy is null or undefined', () => {
    const { container } = render(
      <VerificationPrompt blockedBy={null} currentStep={null} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders neutral verification banner when blockedBy is VERIFICATION_FULL', () => {
    render(
      <VerificationPrompt
        blockedBy="VERIFICATION_FULL"
        currentStep="identify_customer"
      />
    );

    expect(screen.getByTestId('verification-prompt-banner')).toBeInTheDocument();
    expect(
      screen.getByText(/Identity verification required\. Please follow the assistant’s instructions\./i)
    ).toBeInTheDocument();
    expect(screen.queryByTestId('otp-hint')).not.toBeInTheDocument();
  });

  it('renders light confirmation banner when blockedBy is VERIFICATION_LIGHT', () => {
    render(
      <VerificationPrompt
        blockedBy="VERIFICATION_LIGHT"
        currentStep={null}
      />
    );

    expect(
      screen.getByText(/Security confirmation required/i)
    ).toBeInTheDocument();
    expect(screen.queryByTestId('otp-hint')).not.toBeInTheDocument();
  });

  it('displays 6-digit OTP hint when currentStep is verify_identity', () => {
    render(
      <VerificationPrompt
        blockedBy="VERIFICATION_FULL"
        currentStep="verify_identity"
      />
    );

    expect(screen.getByTestId('otp-hint')).toBeInTheDocument();
    expect(
      screen.getByText(/Please enter your 6-digit verification code below\./i)
    ).toBeInTheDocument();
  });

  it('renders dev-only OTP peek when NEXT_PUBLIC_ENABLE_DEMO_CODE is true', async () => {
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
});

