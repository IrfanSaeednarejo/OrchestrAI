'use client';

// src/app/register/page.tsx
// Phase 33: Dedicated user account registration page with split-screen multi-agent orchestration architecture.

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Lock, Mail, User, MapPin, Loader2, Sparkles, ArrowRight, AlertCircle } from 'lucide-react';
import { useAuth } from '../../context/auth-context';

function RegisterFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { register, isAuthenticated, isLoading: isAuthLoading, error: authError, clearError } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [defaultAddress, setDefaultAddress] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const redirectUrl = searchParams?.get('redirect') || '/';

  // If already authenticated, redirect
  useEffect(() => {
    if (!isAuthLoading && isAuthenticated) {
      router.replace(redirectUrl);
    }
  }, [isAuthLoading, isAuthenticated, router, redirectUrl]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    clearError();

    if (!name.trim()) {
      setLocalError('Full name is required');
      return;
    }
    if (!email.trim()) {
      setLocalError('Email address is required');
      return;
    }
    if (!defaultAddress.trim()) {
      setLocalError('Default shipping address is required');
      return;
    }
    if (password.length < 8) {
      setLocalError('Password must be at least 8 characters');
      return;
    }

    setIsSubmitting(true);
    try {
      await register({
        name: name.trim(),
        email: email.trim(),
        defaultAddress: defaultAddress.trim(),
        password,
      });
      router.replace(redirectUrl !== '/' ? redirectUrl : '/store');
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const displayError = localError || authError;

  return (
    <div className="min-h-screen w-full flex flex-col lg:flex-row bg-surface-canvas selection:bg-brand-primary/30 selection:text-white">
      {/* ── Left Visual Section: OrchestrAI Customer Onboarding Ecosystem (Desktop >= lg) ── */}
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
            <span>AUTONOMOUS ONBOARDING</span>
          </div>
        </div>

        {/* Central Customer ID Mesh SVG Visualization */}
        <div className="relative z-10 my-auto flex items-center justify-center py-6">
          <svg
            className="w-full max-w-[560px] h-[340px]"
            viewBox="0 0 680 440"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <circle cx="340" cy="220" r="180" stroke="rgba(138, 11, 36, 0.2)" strokeWidth="1" strokeDasharray="4 6" />
            <circle cx="340" cy="220" r="120" stroke="rgba(209, 25, 62, 0.25)" strokeWidth="1" />

            <path d="M340 220 Q 220 150 160 110" stroke="url(#reg-crimson-gradient)" strokeWidth="2" strokeLinecap="round" />
            <path d="M340 220 Q 460 150 520 110" stroke="url(#reg-crimson-gradient)" strokeWidth="2" strokeLinecap="round" />
            <path d="M340 220 Q 200 290 150 330" stroke="url(#reg-crimson-gradient)" strokeWidth="1.8" strokeDasharray="4 4" />
            <path d="M340 220 Q 480 290 530 330" stroke="url(#reg-crimson-gradient)" strokeWidth="1.8" strokeDasharray="4 4" />

            {/* Central Node: Customer ID Mesh */}
            <g transform="translate(340, 220)">
              <circle r="36" fill="url(#reg-core-radial)" stroke="#D1193E" strokeWidth="2" />
              <circle r="44" stroke="rgba(209,25,62,0.4)" strokeWidth="1" strokeDasharray="2 4" />
              <text y="-4" textAnchor="middle" fill="#FFF9FA" fontFamily="inherit" fontWeight="700" fontSize="11">
                CUSTOMER
              </text>
              <text y="10" textAnchor="middle" fill="#FF8FA3" fontFamily="monospace" fontSize="8.5" fontWeight="600">
                ID MESH
              </text>
            </g>

            {/* Satellite Nodes */}
            <g transform="translate(160, 110)">
              <circle r="26" fill="#1C0911" stroke="#753044" strokeWidth="1.5" />
              <text y="4" textAnchor="middle" fill="#FFF9FA" fontFamily="monospace" fontSize="8" fontWeight="600">
                CATALOG
              </text>
            </g>

            <g transform="translate(520, 110)">
              <circle r="26" fill="#1C0911" stroke="#753044" strokeWidth="1.5" />
              <text y="4" textAnchor="middle" fill="#FFF9FA" fontFamily="monospace" fontSize="8" fontWeight="600">
                ORDERS
              </text>
            </g>

            <g transform="translate(150, 330)">
              <circle r="26" fill="#1C0911" stroke="#753044" strokeWidth="1.5" />
              <text y="4" textAnchor="middle" fill="#FFF9FA" fontFamily="monospace" fontSize="8" fontWeight="600">
                SHIPPING
              </text>
            </g>

            <g transform="translate(530, 330)">
              <circle r="26" fill="#1C0911" stroke="#753044" strokeWidth="1.5" />
              <text y="4" textAnchor="middle" fill="#FFF9FA" fontFamily="monospace" fontSize="8" fontWeight="600">
                SECURITY
              </text>
            </g>

            <defs>
              <radialGradient id="reg-core-radial" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#A8112F" />
                <stop offset="100%" stopColor="#420410" />
              </radialGradient>
              <linearGradient id="reg-crimson-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#D1193E" stopOpacity="0.85" />
                <stop offset="100%" stopColor="#FF8FA3" stopOpacity="0.3" />
              </linearGradient>
            </defs>
          </svg>
        </div>

        {/* Editorial Statement & Metrics Footer */}
        <div className="relative z-10 flex flex-col gap-4 max-w-lg">
          <div className="text-2xl font-extrabold tracking-tight text-content-primary leading-snug">
            One account.{' '}
            <span className="text-brand-link font-normal italic">Zero support friction.</span>
          </div>
          <p className="text-xs text-content-secondary leading-relaxed">
            Register to browse verified products, place orders, and experience instantaneous conversational issue resolution.
          </p>
          <div className="flex gap-6 pt-3 border-t border-edge-subtle/50 font-mono text-xs">
            <div>
              <div className="font-semibold text-content-primary">INSTANT</div>
              <div className="text-[10px] text-content-muted uppercase">Cart Sync</div>
            </div>
            <div>
              <div className="font-semibold text-content-primary">SCRYPT</div>
              <div className="text-[10px] text-content-muted uppercase">Pass Hash</div>
            </div>
            <div>
              <div className="font-semibold text-content-primary">HMAC-256</div>
              <div className="text-[10px] text-content-muted uppercase">Auth Tokens</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Right Section: Authentication Form Panel (Register) ── */}
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
            <span>SECURE ONBOARDING</span>
          </div>
        </div>

        {/* Form Container */}
        <div className="w-full max-w-[390px] flex flex-col">
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-content-primary tracking-tight">
              Create Customer Account
            </h1>
            <p className="text-xs text-content-secondary mt-1.5 leading-relaxed">
              Register to browse catalog products, place orders, and access autonomous support.
            </p>
          </div>

          {/* Error Message */}
          {displayError && (
            <div
              data-testid="register-error-banner"
              role="alert"
              className="mb-5 p-3 rounded-control bg-status-error/10 border border-status-error/25 text-status-error text-xs font-medium flex items-start gap-2.5"
            >
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span className="leading-relaxed">{displayError}</span>
            </div>
          )}

          {/* Register Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-content-secondary mb-1.5">
                Full Name
              </label>
              <div className="relative">
                <User className="absolute left-3.5 top-3 h-4 w-4 text-content-muted pointer-events-none" />
                <input
                  type="text"
                  required
                  data-testid="register-name-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jane Doe"
                  className="w-full pl-10 pr-3.5 py-2.5 text-sm bg-surface-inset border border-edge-subtle rounded-control text-content-primary placeholder-content-muted focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary/30 transition-all font-sans"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-content-secondary mb-1.5">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-3 h-4 w-4 text-content-muted pointer-events-none" />
                <input
                  type="email"
                  required
                  data-testid="register-email-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full pl-10 pr-3.5 py-2.5 text-sm bg-surface-inset border border-edge-subtle rounded-control text-content-primary placeholder-content-muted focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary/30 transition-all font-sans"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-content-secondary mb-1.5">
                Default Shipping Address
              </label>
              <div className="relative">
                <MapPin className="absolute left-3.5 top-3 h-4 w-4 text-content-muted pointer-events-none" />
                <input
                  type="text"
                  required
                  data-testid="register-address-input"
                  value={defaultAddress}
                  onChange={(e) => setDefaultAddress(e.target.value)}
                  placeholder="742 Evergreen Terrace, Springfield"
                  className="w-full pl-10 pr-3.5 py-2.5 text-sm bg-surface-inset border border-edge-subtle rounded-control text-content-primary placeholder-content-muted focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary/30 transition-all font-sans"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-content-secondary mb-1.5">
                Password <span className="text-content-muted font-normal">(min 8 characters)</span>
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-3 h-4 w-4 text-content-muted pointer-events-none" />
                <input
                  type="password"
                  required
                  data-testid="register-password-input"
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
              data-testid="register-submit-btn"
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-control bg-brand-primary hover:bg-brand-hover active:bg-brand-deep text-white font-medium text-sm transition-all shadow-glow-brand hover:shadow-glow-brand-lg disabled:opacity-50 disabled:pointer-events-none mt-6 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Creating account...</span>
                </>
              ) : (
                <>
                  <span>Create Account</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          {/* Switch to Login */}
          <div className="mt-8 pt-5 border-t border-edge-subtle text-center text-xs text-content-muted">
            Already have an account?{' '}
            <Link
              href={`/login${redirectUrl !== '/' ? `?redirect=${encodeURIComponent(redirectUrl)}` : ''}`}
              data-testid="link-to-login"
              className="font-semibold text-brand-link hover:text-brand-hover underline underline-offset-2 transition-colors ml-1"
            >
              Sign in instead
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen w-full bg-surface-canvas flex items-center justify-center text-content-muted text-sm gap-2">
          <Loader2 className="h-5 w-5 animate-spin text-brand-primary" />
          <span>Loading...</span>
        </div>
      }
    >
      <RegisterFormContent />
    </Suspense>
  );
}
