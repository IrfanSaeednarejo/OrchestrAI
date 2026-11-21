'use client';

// src/app/register/page.tsx
// Phase 33: Dedicated user account registration page with Midnight Burgundy / Imperial Crimson design system.

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
    <div className="w-full max-w-md bg-surface border border-edge-subtle rounded-dialog shadow-elevated p-8 text-content-primary">
      {/* Brand Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center gap-2.5 mb-3">
          <div className="w-10 h-10 rounded-xl bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center text-brand-link shadow-glow-brand">
            <Sparkles className="h-5 w-5" />
          </div>
          <span className="text-2xl font-bold tracking-tight text-content-primary font-sans">
            OrchestrAI
          </span>
        </div>
        <h1 className="text-xl font-bold text-content-primary tracking-tight">
          Create Customer Account
        </h1>
        <p className="text-xs text-content-secondary mt-1">
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
      <div className="mt-8 pt-6 border-t border-edge-subtle text-center text-xs text-content-muted">
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
  );
}

export default function RegisterPage() {
  return (
    <div className="min-h-screen w-full bg-surface-canvas flex items-center justify-center p-4 selection:bg-brand-primary/30 selection:text-white">
      <Suspense
        fallback={
          <div className="text-content-muted text-sm flex items-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin text-brand-primary" />
            <span>Loading...</span>
          </div>
        }
      >
        <RegisterFormContent />
      </Suspense>
    </div>
  );
}
