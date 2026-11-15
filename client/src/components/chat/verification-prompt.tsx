// src/components/chat/verification-prompt.tsx
// Phase 17 Step 5c: Neutral verification prompt & optional dev OTP peek.

import React, { useState, useEffect } from 'react';
import { ShieldAlert, KeyRound, Copy, Check, Eye } from 'lucide-react';
import { peekDevVerificationCode } from '../../lib/api-client';

interface VerificationPromptProps {
  blockedBy: string | null | undefined;
  currentStep: string | null | undefined;
  userId?: string;
  onCodeSelect?: (code: string) => void;
  className?: string;
}

export function VerificationPrompt({
  blockedBy,
  currentStep,
  userId,
  onCodeSelect,
  className = '',
}: VerificationPromptProps) {
  const [devCode, setDevCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isPeeking, setIsPeeking] = useState(false);

  const isDevCodeEnabled =
    typeof process !== 'undefined' &&
    process.env.NEXT_PUBLIC_ENABLE_DEMO_CODE === 'true';

  useEffect(() => {
    // Reset dev code when blockedBy clears
    if (!blockedBy) {
      setDevCode(null);
    }
  }, [blockedBy]);

  if (!blockedBy) {
    return null;
  }

  const isFull = blockedBy === 'VERIFICATION_FULL';
  const isAwaitingCode = isFull && currentStep === 'verify_identity';

  const handleFetchDevCode = async () => {
    if (!userId) return;
    setIsPeeking(true);
    try {
      const code = await peekDevVerificationCode(userId);
      setDevCode(code);
    } finally {
      setIsPeeking(false);
    }
  };

  const handleCopy = (code: string) => {
    navigator.clipboard?.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    if (onCodeSelect) {
      onCodeSelect(code);
    }
  };

  return (
    <div
      data-testid="verification-prompt-banner"
      className={`rounded-lg border p-3 text-sm transition-all shadow-sm ${
        isFull
          ? 'bg-amber-50 border-amber-200 text-amber-900'
          : 'bg-blue-50 border-blue-200 text-blue-900'
      } ${className}`}
    >
      <div className="flex items-start gap-2.5">
        <ShieldAlert
          className={`h-5 w-5 shrink-0 mt-0.5 ${
            isFull ? 'text-amber-600' : 'text-blue-600'
          }`}
        />
        <div className="flex-1 space-y-1">
          <div className="font-semibold text-xs tracking-wide uppercase">
            {isFull ? 'Verification Required' : 'Security Confirmation'}
          </div>
          <p className="text-xs">
            {isFull
              ? 'Identity verification required. Please follow the assistant’s instructions.'
              : 'Security confirmation required. Please confirm your identity details as requested.'}
          </p>

          {isAwaitingCode && (
            <div
              data-testid="otp-hint"
              className="mt-2 flex items-center gap-1.5 text-xs font-medium text-amber-800"
            >
              <KeyRound className="h-3.5 w-3.5" />
              <span>Please enter your 6-digit verification code below.</span>
            </div>
          )}

          {/* Dev-only OTP peek helper */}
          {isDevCodeEnabled && isAwaitingCode && userId && (
            <div
              data-testid="dev-otp-container"
              className="mt-2.5 pt-2 border-t border-amber-200 flex flex-wrap items-center gap-2"
            >
              <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                Dev Helper
              </span>
              {!devCode ? (
                <button
                  type="button"
                  onClick={handleFetchDevCode}
                  disabled={isPeeking}
                  data-testid="peek-dev-otp-button"
                  className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-amber-200 hover:bg-amber-300 text-amber-900 rounded transition-colors"
                >
                  <Eye className="h-3 w-3" />
                  <span>{isPeeking ? 'Checking...' : 'Peek Dev OTP'}</span>
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold tracking-widest bg-amber-200/80 px-2 py-0.5 rounded text-amber-950">
                    {devCode}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopy(devCode)}
                    data-testid="copy-dev-otp-button"
                    className="inline-flex items-center gap-1 text-xs text-amber-800 hover:text-amber-950 underline"
                  >
                    {copied ? (
                      <>
                        <Check className="h-3 w-3 text-emerald-600" />
                        <span className="text-emerald-700 font-medium">Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3" />
                        <span>Copy / Use</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

