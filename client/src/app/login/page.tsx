'use client';

// src/app/login/page.tsx
// Phase 33: Dedicated user sign-in page with split-screen multi-agent orchestration architecture.

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Lock, Mail, Loader2, Sparkles, ArrowRight, AlertCircle } from 'lucide-react';
import { useAuth } from '../../context/auth-context';

function LoginFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, isAuthenticated, isLoading: isAuthLoading, error: authError, clearError } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const redirectUrl = searchParams?.get('redirect') || '/';

  // If already authenticated, redirect to destination
  useEffect(() => {
    if (!isAuthLoading && isAuthenticated) {
      router.replace(redirectUrl);
    }
  }, [isAuthLoading, isAuthenticated, router, redirectUrl]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    clearError();

    if (!email.trim() || !password) {
      setLocalError('Email and password are required');
      return;
    }

    setIsSubmitting(true);
    try {
      await login(email.trim(), password);
      router.replace(redirectUrl);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const displayError = localError || authError;

  return (
    <div className="min-h-screen w-full flex flex-col lg:flex-row bg-surface-canvas selection:bg-brand-primary/30 selection:text-white">
      {/* ── Left Visual Section: OrchestrAI Multi-Agent Ecosystem (Desktop >= lg) ── */}
      <div className="hidden lg:flex flex-[1.35] relative bg-gradient-to-br from-[#1b0811] via-[#12050b] to-[#0a0306] p-12 xl:p-16 flex-col justify-between overflow-hidden border-r border-edge-subtle/40 select-none">
        {/* Ambient radial lighting and coordinate grid */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_45%_45%,rgba(168,17,47,0.22),rgba(66,4,16,0.1)_50%,transparent_75%)] pointer-events-none" />
        <div
          className="absolute inset-0 opacity-[0.06] pointer-events-none"
          style={{
            backgroundImage:
              'linear-gradient(to right, rgba(255,255,255,0.4) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.4) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
            maskImage: 'radial-gradient(circle at 50% 50%, black 40%, transparent 80%)',
          }}
        />

        {/* Visual Header */}
        <div className="relative z-10 flex items-center justify-between">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface/70 border border-edge-subtle backdrop-blur-md">
            <Sparkles className="h-3.5 w-3.5 text-brand-link" />
            <span className="text-xs font-bold tracking-wider uppercase text-brand-link">
              OrchestrAI Platform
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs font-mono text-content-muted">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-status-success opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-status-success" />
            </span>
            <span>6 SPECIALISTS ONLINE</span>
          </div>
        </div>

        {/* Central Multi-Agent Orchestration SVG Mesh */}
        <div className="relative z-10 my-auto flex items-center justify-center py-6">
          <svg
            className="w-full max-w-[560px] h-[340px]"
            viewBox="0 0 680 440"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            {/* Concentric Telemetry Circles */}
            <circle cx="340" cy="220" r="180" stroke="rgba(138, 11, 36, 0.2)" strokeWidth="1" strokeDasharray="4 6" />
            <circle cx="340" cy="220" r="120" stroke="rgba(209, 25, 62, 0.25)" strokeWidth="1" />
            <circle cx="340" cy="220" r="65" stroke="rgba(255, 143, 163, 0.3)" strokeWidth="1.5" strokeDasharray="3 3" />

            {/* Dynamic Connecting Paths */}
            <path d="M340 220 Q 240 160 180 120" stroke="url(#login-crimson-gradient)" strokeWidth="2" strokeLinecap="round" />
            <path d="M340 220 Q 220 270 170 310" stroke="url(#login-crimson-gradient)" strokeWidth="1.8" strokeDasharray="4 4" />
            <path d="M340 220 Q 430 160 500 120" stroke="url(#login-crimson-gradient)" strokeWidth="2" strokeLinecap="round" />
            <path d="M340 220 Q 450 270 510 310" stroke="url(#login-crimson-gradient)" strokeWidth="1.8" strokeDasharray="4 4" />
            <path d="M340 220 L 340 50" stroke="url(#login-crimson-gradient)" strokeWidth="2" />
            <path d="M340 220 L 340 380" stroke="url(#login-crimson-gradient)" strokeWidth="2" />

            {/* Lateral Handoff Arcs */}
            <path d="M180 120 Q 150 215 170 310" stroke="rgba(255,143,163,0.35)" strokeWidth="1.2" strokeDasharray="3 3" />
            <path d="M500 120 Q 530 215 510 310" stroke="rgba(255,143,163,0.35)" strokeWidth="1.2" strokeDasharray="3 3" />

            {/* Central Meta-Orchestrator Node */}
            <g transform="translate(340, 220)">
              <circle r="36" fill="url(#login-core-radial)" stroke="#D1193E" strokeWidth="2" />
              <circle r="44" stroke="rgba(209,25,62,0.4)" strokeWidth="1" strokeDasharray="2 4" />
              <text y="-4" textAnchor="middle" fill="#FFF9FA" fontFamily="inherit" fontWeight="700" fontSize="11">
                META
              </text>
              <text y="10" textAnchor="middle" fill="#FF8FA3" fontFamily="monospace" fontSize="8.5" fontWeight="600">
                TRIAGE
              </text>
            </g>

            {/* Specialist Nodes */}
            <g transform="translate(180, 120)">
              <circle r="26" fill="#1C0911" stroke="#753044" strokeWidth="1.5" />
              <circle r="3" cx="0" cy="-6" fill="#93C5FD" />
              <text y="7" textAnchor="middle" fill="#FFF9FA" fontFamily="monospace" fontSize="8" fontWeight="600">
                ORDERS
              </text>
            </g>

            <g transform="translate(170, 310)">
              <circle r="26" fill="#1C0911" stroke="#753044" strokeWidth="1.5" />
              <circle r="3" cx="0" cy="-6" fill="#FBBF24" />
              <text y="7" textAnchor="middle" fill="#FFF9FA" fontFamily="monospace" fontSize="8" fontWeight="600">
                RETURNS
              </text>
            </g>

            <g transform="translate(500, 120)">
              <circle r="26" fill="#1C0911" stroke="#753044" strokeWidth="1.5" />
              <circle r="3" cx="0" cy="-6" fill="#34D399" />
              <text y="7" textAnchor="middle" fill="#FFF9FA" fontFamily="monospace" fontSize="8" fontWeight="600">
                PAYMENT
              </text>
            </g>

            <g transform="translate(510, 310)">
              <circle r="26" fill="#1C0911" stroke="#753044" strokeWidth="1.5" />
              <circle r="3" cx="0" cy="-6" fill="#FB7185" />
              <text y="7" textAnchor="middle" fill="#FFF9FA" fontFamily="monospace" fontSize="8" fontWeight="600">
                REFUND
              </text>
            </g>

            <g transform="translate(340, 50)">
              <rect x="-38" y="-14" width="76" height="28" rx="14" fill="#1C0911" stroke="#D1193E" strokeWidth="1.2" />
              <text y="4" textAnchor="middle" fill="#FFF9FA" fontFamily="monospace" fontSize="8" fontWeight="600">
                SECURITY OTP
              </text>
            </g>

            <g transform="translate(340, 380)">
              <rect x="-34" y="-14" width="68" height="28" rx="14" fill="#1C0911" stroke="#753044" strokeWidth="1.2" />
              <text y="4" textAnchor="middle" fill="#FFF9FA" fontFamily="monospace" fontSize="8" fontWeight="600">
                PROFILE
              </text>
            </g>

            <defs>
              <radialGradient id="login-core-radial" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#A8112F" />
                <stop offset="100%" stopColor="#420410" />
              </radialGradient>
              <linearGradient id="login-crimson-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#D1193E" stopOpacity="0.85" />
                <stop offset="100%" stopColor="#FF8FA3" stopOpacity="0.3" />
              </linearGradient>
            </defs>
          </svg>
        </div>

        {/* Editorial Statement & Metrics Footer */}
        <div className="relative z-10 flex flex-col gap-4 max-w-lg">
          <div className="text-2xl font-extrabold tracking-tight text-content-primary leading-snug">
            Stateful multi-agent intelligence,{' '}
            <span className="text-brand-link font-normal italic">orchestrated.</span>
          </div>
          <p className="text-xs text-content-secondary leading-relaxed">
            Autonomous customer resolution across orders, payments, returns, and verified accounts with durable LangGraph checkpointing.
          </p>
          <div className="flex gap-6 pt-3 border-t border-edge-subtle/50 font-mono text-xs">
            <div>
              <div className="font-semibold text-content-primary">6 AGENTS</div>
              <div className="text-[10px] text-content-muted uppercase">Coordinated</div>
            </div>
            <div>
              <div className="font-semibold text-content-primary">&lt; 14 MS</div>
              <div className="text-[10px] text-content-muted uppercase">Checkpoint Latency</div>
            </div>
            <div>
              <div className="font-semibold text-content-primary">100% PII</div>
              <div className="text-[10px] text-content-muted uppercase">Redaction Gate</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Right Section: Authentication Form Panel ── */}
      <div className="flex-1 flex flex-col justify-center items-center p-6 sm:p-12 lg:p-16">
        {/* Mobile Compact Header (< lg) */}
        <div className="lg:hidden w-full max-w-sm mb-6 p-4 rounded-xl bg-surface border border-edge-subtle flex items-center justify-between">
          <div className="inline-flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center text-brand-link shadow-glow-brand">
              <Sparkles className="h-4 w-4" />
            </div>
            <span className="text-base font-bold tracking-tight text-content-primary">OrchestrAI</span>
          </div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-inset border border-edge-subtle font-mono text-[10px] text-brand-link">
            <span className="h-1.5 w-1.5 rounded-full bg-status-success animate-pulse" />
            <span>6 AGENTS</span>
          </div>
        </div>

        {/* Form Container */}
        <div className="w-full max-w-[390px] flex flex-col">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-content-primary tracking-tight">
              Sign In to Your Account
            </h1>
            <p className="text-xs text-content-secondary mt-1.5 leading-relaxed">
              Access your orders, track shipments, and chat with AI customer specialists.
            </p>
          </div>

          {/* Error Message */}
          {displayError && (
            <div
              data-testid="login-error-banner"
              role="alert"
              className="mb-5 p-3 rounded-control bg-status-error/10 border border-status-error/25 text-status-error text-xs font-medium flex items-start gap-2.5"
            >
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span className="leading-relaxed">{displayError}</span>
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-content-secondary mb-1.5">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-3 h-4 w-4 text-content-muted pointer-events-none" />
                <input
                  type="email"
                  required
                  data-testid="login-email-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full pl-10 pr-3.5 py-2.5 text-sm bg-surface-inset border border-edge-subtle rounded-control text-content-primary placeholder-content-muted focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary/30 transition-all font-sans"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-content-secondary mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-3 h-4 w-4 text-content-muted pointer-events-none" />
                <input
                  type="password"
                  required
                  data-testid="login-password-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-3.5 py-2.5 text-sm bg-surface-inset border border-edge-subtle rounded-control text-content-primary placeholder-content-muted focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary/30 transition-all font-sans"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              data-testid="login-submit-btn"
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-control bg-brand-primary hover:bg-brand-hover active:bg-brand-deep text-white font-medium text-sm transition-all shadow-glow-brand hover:shadow-glow-brand-lg disabled:opacity-50 disabled:pointer-events-none mt-6 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Signing in...</span>
                </>
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          {/* Switch to Register */}
          <div className="mt-8 pt-5 border-t border-edge-subtle text-center text-xs text-content-muted">
            Don&apos;t have an account yet?{' '}
            <Link
              href={`/register${redirectUrl !== '/' ? `?redirect=${encodeURIComponent(redirectUrl)}` : ''}`}
              data-testid="link-to-register"
              className="font-semibold text-brand-link hover:text-brand-hover underline underline-offset-2 transition-colors ml-1"
            >
              Create an account
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen w-full bg-surface-canvas flex items-center justify-center text-content-muted text-sm gap-2">
          <Loader2 className="h-5 w-5 animate-spin text-brand-primary" />
          <span>Loading...</span>
        </div>
      }
    >
      <LoginFormContent />
    </Suspense>
  );
}
