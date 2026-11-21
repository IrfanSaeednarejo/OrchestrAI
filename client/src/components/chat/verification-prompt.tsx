// src/components/chat/verification-prompt.tsx
// Phase 17 Step 5c: Neutral verification prompt & optional dev OTP peek.
// Phase 26: Extended to support profile-update flow states.
// Phase 30 Step 5: Dark theme redesign — elevated surface, semantic colors, Geist Mono countdowns.
//   All data-testids, state machine logic, and functional behavior preserved.

import React, { useState, useEffect, useCallback } from 'react';
import { ShieldAlert, KeyRound, Copy, Check, Eye, AlertTriangle, RefreshCw, Headphones } from 'lucide-react';
import { peekDevVerificationCode } from '../../lib/api-client';

// ── State machine ─────────────────────────────────────────────────────────────
// The component derives its display state from blockedBy + currentStep props.
//
//  currentStep        | Derived UI state
//  -------------------|----------------------------------
//  'verify_identity'  | SENT_AWAITING_CODE (Account Access path)
//  'awaiting_code'    | SENT_AWAITING_CODE (Profile update path)
//  'confirm_change'   | IDLE (no banner needed — assistant is handling it)
//  'collect_value'    | IDLE
//  null + FULL        | IDLE (prompt to follow assistant instructions)
//
// Additional props drive richer states:
//   sendFailed=true                → SEND_FAILED
//   cooldownSeconds > 0            → COOLDOWN_ACTIVE
//   expired=true                   → EXPIRED
//   lockedOut=true                 → LOCKED_OUT

export type VerificationUIState =
  | 'IDLE'
  | 'SENT_AWAITING_CODE'
  | 'COOLDOWN_ACTIVE'
  | 'SEND_FAILED'
  | 'EXPIRED'
  | 'LOCKED_OUT';

interface VerificationPromptProps {
  blockedBy: string | null | undefined;
  currentStep: string | null | undefined;
  userId?: string;
  onCodeSelect?: (code: string) => void;
  className?: string;
  // Profile-update specific:
  maskedEmail?: string | null;
  /** Epoch-ms when the code expires (from server). Drives countdown display. */
  expiresAt?: number | null;
  /** Epoch-ms when resend becomes available (from server). Drives resend countdown. */
  resendAt?: number | null;
  sendFailed?: boolean;
  sendFailReason?: string | null;
  lockedOut?: boolean;
  expired?: boolean;
  onResend?: () => void;
  onContactSupport?: () => void;
}

function useCountdown(epochMs: number | null | undefined): number {
  const [remaining, setRemaining] = useState(() =>
    epochMs ? Math.max(0, Math.round((epochMs - Date.now()) / 1000)) : 0
  );

  useEffect(() => {
    if (!epochMs) { setRemaining(0); return; }
    const tick = () => setRemaining(Math.max(0, Math.round((epochMs - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [epochMs]);

  return remaining;
}

export function VerificationPrompt({
  blockedBy,
  currentStep,
  userId,
  onCodeSelect,
  className = '',
  maskedEmail,
  expiresAt,
  resendAt,
  sendFailed = false,
  sendFailReason,
  lockedOut = false,
  expired = false,
  onResend,
  onContactSupport,
}: VerificationPromptProps) {
  const [devCode, setDevCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isPeeking, setIsPeeking] = useState(false);

  const resendCountdown = useCountdown(resendAt);
  const expiryCountdown = useCountdown(expiresAt);
  const canResend = resendCountdown === 0;

  const isDevCodeEnabled =
    typeof process !== 'undefined' &&
    process.env.NEXT_PUBLIC_ENABLE_DEMO_CODE === 'true';

  useEffect(() => {
    if (!blockedBy) setDevCode(null);
  }, [blockedBy]);

  const handleFetchDevCode = useCallback(async () => {
    if (!userId) return;
    setIsPeeking(true);
    try {
      const code = await peekDevVerificationCode(userId);
      setDevCode(code);
    } finally {
      setIsPeeking(false);
    }
  }, [userId]);

  const handleCopy = useCallback((code: string) => {
    navigator.clipboard?.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    if (onCodeSelect) onCodeSelect(code);
  }, [onCodeSelect]);

  if (!blockedBy) return null;

  const isFull = blockedBy === 'VERIFICATION_FULL';
  const isAwaitingCode =
    isFull &&
    (currentStep === 'verify_identity' || currentStep === 'awaiting_code');

  // Derive UI state
  let uiState: VerificationUIState = 'IDLE';
  if (lockedOut) uiState = 'LOCKED_OUT';
  else if (expired) uiState = 'EXPIRED';
  else if (sendFailed) uiState = 'SEND_FAILED';
  else if (!canResend && resendAt && resendAt > Date.now()) uiState = 'COOLDOWN_ACTIVE';
  else if (isAwaitingCode) uiState = 'SENT_AWAITING_CODE';

  // Surface and icon colors using design system semantic tokens
  const isError = uiState === 'SEND_FAILED' || uiState === 'LOCKED_OUT' || uiState === 'EXPIRED';
  const isWarning = isFull && !isError;

  const bannerBg = isError
    ? 'bg-surface border-status-error/30'
    : isWarning
    ? 'bg-surface border-status-warning/30'
    : 'bg-surface border-edge-subtle';

  const iconColor = isError
    ? 'text-status-error'
    : isWarning
    ? 'text-status-warning'
    : 'text-status-info';

  const titleColor = isError
    ? 'text-status-error'
    : isWarning
    ? 'text-status-warning'
    : 'text-content-secondary';

  return (
    <div
      data-testid="verification-prompt-banner"
      className={`rounded-card border p-3 text-sm transition-all shadow-sm ${bannerBg} ${className}`}
    >
      <div className="flex items-start gap-2.5">
        {uiState === 'SEND_FAILED' ? (
          <AlertTriangle className={`h-5 w-5 shrink-0 mt-0.5 ${iconColor}`} />
        ) : (
          <ShieldAlert className={`h-5 w-5 shrink-0 mt-0.5 ${iconColor}`} />
        )}

        <div className="flex-1 space-y-1">
          {/* ── Title ── */}
          <div className={`font-semibold text-xs tracking-wide uppercase ${titleColor}`}>
            {uiState === 'SEND_FAILED' && 'Delivery Failed'}
            {uiState === 'LOCKED_OUT' && 'Too Many Attempts'}
            {uiState === 'EXPIRED' && 'Code Expired'}
            {uiState === 'COOLDOWN_ACTIVE' && 'Code Active'}
            {uiState === 'SENT_AWAITING_CODE' && 'Code Sent'}
            {uiState === 'IDLE' && (isFull ? 'Identity Verification' : 'Security Confirmation')}
          </div>

          {/* ── Body copy — no system-leak strings ── */}
          {uiState === 'IDLE' && (
            <p className="text-xs text-content-secondary" data-testid="idle-body">
              {isFull
                ? 'Your assistant will guide you through the verification steps. Please follow the instructions above.'
                : 'Your assistant will ask you to confirm your identity details. Please follow the instructions above.'}
            </p>
          )}

          {uiState === 'SENT_AWAITING_CODE' && (
            <p className="text-xs text-content-secondary" data-testid="awaiting-code-body">
              {maskedEmail
                ? <>A 6-digit code was sent to <strong className="text-content-primary">{maskedEmail}</strong>. Enter it in the chat.</>
                : 'A 6-digit code was sent to your email. Enter it in the chat.'}
              {expiryCountdown > 0 && (
                <span className="ml-1 font-mono text-status-warning">
                  (expires in {expiryCountdown}s)
                </span>
              )}
            </p>
          )}

          {uiState === 'COOLDOWN_ACTIVE' && (
            <p className="text-xs text-content-secondary" data-testid="cooldown-body">
              Your code is still active.
              {resendCountdown > 0 && <span className="font-mono"> You can resend in {resendCountdown}s.</span>}
              {maskedEmail && <> Check your inbox at <strong className="text-content-primary">{maskedEmail}</strong> (including spam).</>}
            </p>
          )}

          {uiState === 'SEND_FAILED' && (
            <p className="text-xs text-content-secondary" data-testid="send-failed-body">
              {maskedEmail
                ? <>We couldn&apos;t deliver the code to <strong className="text-content-primary">{maskedEmail}</strong>.</>
                : "We couldn't deliver the verification code."}
              {sendFailReason && <span className="ml-1 opacity-70">({sendFailReason})</span>}
            </p>
          )}

          {uiState === 'EXPIRED' && (
            <p className="text-xs text-content-secondary" data-testid="expired-body">
              Your verification code has expired. Click &quot;Resend code&quot; to get a new one.
            </p>
          )}

          {uiState === 'LOCKED_OUT' && (
            <p className="text-xs text-content-secondary" data-testid="locked-out-body">
              You&apos;ve used all 5 verification attempts.
              Clicking <strong className="text-content-primary">&quot;Resend code&quot;</strong> will generate a fresh code and reset your attempts to 0.
            </p>
          )}

          {/* ── OTP hint for awaiting-code states ── */}
          {uiState === 'SENT_AWAITING_CODE' && (
            <div
              data-testid="otp-hint"
              className="mt-2 flex items-center gap-1.5 text-xs font-medium text-status-warning"
            >
              <KeyRound className="h-3.5 w-3.5" />
              <span>Enter your 6-digit code in the chat below.</span>
            </div>
          )}

          {/* ── Action buttons ── */}
          {(uiState === 'SEND_FAILED' || uiState === 'EXPIRED' || uiState === 'LOCKED_OUT' ||
            (uiState === 'COOLDOWN_ACTIVE' && canResend) ||
            (uiState === 'SENT_AWAITING_CODE' && canResend)) && onResend && (
            <div className="mt-2 flex flex-wrap gap-2" data-testid="action-buttons">
              <button
                type="button"
                onClick={onResend}
                disabled={!canResend}
                data-testid="resend-code-button"
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-tag bg-surface-elevated hover:bg-surface-hover text-content-secondary border border-edge-subtle disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <RefreshCw className="h-3 w-3" />
                {resendCountdown > 0 ? <span className="font-mono">Resend in {resendCountdown}s</span> : 'Resend code'}
              </button>

              {onContactSupport && (
                <button
                  type="button"
                  onClick={onContactSupport}
                  data-testid="contact-support-button"
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-tag bg-surface-elevated hover:bg-surface-hover text-content-muted border border-edge-subtle transition-colors"
                >
                  <Headphones className="h-3 w-3" />
                  Contact support
                </button>
              )}
            </div>
          )}

          {/* ── Dev-only OTP peek helper ── */}
          {isDevCodeEnabled && isAwaitingCode && userId && (
            <div
              data-testid="dev-otp-container"
              className="mt-2.5 pt-2 border-t border-edge-subtle flex flex-wrap items-center gap-2"
            >
              <span className="text-[11px] font-semibold uppercase tracking-wider text-content-muted bg-surface-elevated px-1.5 py-0.5 rounded-tag border border-edge-subtle">
                Dev Helper
              </span>
              {!devCode ? (
                <button
                  type="button"
                  onClick={handleFetchDevCode}
                  disabled={isPeeking}
                  data-testid="peek-dev-otp-button"
                  className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-surface-elevated hover:bg-surface-hover text-brand-link rounded-tag border border-edge-subtle transition-colors"
                >
                  <Eye className="h-3 w-3" />
                  <span>{isPeeking ? 'Checking...' : 'Peek Dev OTP'}</span>
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold tracking-widest bg-brand-deep px-2 py-0.5 rounded-tag text-brand-link border border-brand-mid">
                    {devCode}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopy(devCode)}
                    data-testid="copy-dev-otp-button"
                    className="inline-flex items-center gap-1 text-xs text-content-muted hover:text-content-primary underline"
                  >
                    {copied ? (
                      <>
                        <Check className="h-3 w-3 text-status-success" />
                        <span className="text-status-success font-medium">Copied!</span>
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
