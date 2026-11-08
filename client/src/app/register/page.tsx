'use client';

// src/app/register/page.tsx
// Phase 22: Dedicated user account registration page.

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Lock, Mail, User, MapPin, Loader2, Sparkles, ArrowRight } from 'lucide-react';
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
    <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-8 text-slate-100">
      {/* Brand Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center gap-2 mb-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/30">
            <Sparkles className="h-5 w-5" />
          </div>
          <span className="text-2xl font-bold tracking-tight text-white">OrchestrAI</span>
        </div>
        <h1 className="text-xl font-bold text-white tracking-tight">Create Customer Account</h1>
        <p className="text-xs text-slate-400 mt-1">
          Register to browse catalog products, place orders, and access autonomous support.
        </p>
      </div>

      {/* Error Message */}
      {displayError && (
        <div
          data-testid="register-error-banner"
          className="mb-5 p-3 rounded-lg bg-rose-950/70 border border-rose-800 text-rose-300 text-xs font-medium"
        >
          {displayError}
        </div>
      )}

      {/* Register Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">
            Full Name
          </label>
          <div className="relative">
            <User className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
            <input
              type="text"
              required
              data-testid="register-name-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jane Doe"
              className="w-full pl-10 pr-3.5 py-2.5 text-sm bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">
            Email Address
          </label>
          <div className="relative">
            <Mail className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
            <input
              type="email"
              required
              data-testid="register-email-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full pl-10 pr-3.5 py-2.5 text-sm bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">
            Default Shipping Address
          </label>
          <div className="relative">
            <MapPin className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
            <input
              type="text"
              required
              data-testid="register-address-input"
              value={defaultAddress}
              onChange={(e) => setDefaultAddress(e.target.value)}
              placeholder="742 Evergreen Terrace, Springfield"
              className="w-full pl-10 pr-3.5 py-2.5 text-sm bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">
            Password <span className="text-slate-400 font-normal">(min 8 characters)</span>
          </label>
          <div className="relative">
            <Lock className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
            <input
              type="password"
              required
              data-testid="register-password-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full pl-10 pr-3.5 py-2.5 text-sm bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          data-testid="register-submit-btn"
          className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-medium text-sm transition-all shadow-md shadow-indigo-600/20 disabled:opacity-50 mt-6"
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
      <div className="mt-8 pt-6 border-t border-slate-800 text-center text-xs text-slate-400">
        Already have an account?{' '}
        <Link
          href={`/login${redirectUrl !== '/' ? `?redirect=${encodeURIComponent(redirectUrl)}` : ''}`}
          data-testid="link-to-login"
          className="font-semibold text-indigo-400 hover:text-indigo-300 underline underline-offset-2 transition-colors ml-1"
        >
          Sign in instead
        </Link>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <div className="min-h-screen w-full bg-slate-950 flex items-center justify-center p-4">
      <Suspense
        fallback={
          <div className="text-slate-400 text-sm flex items-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin text-indigo-500" />
            <span>Loading...</span>
          </div>
        }
      >
        <RegisterFormContent />
      </Suspense>
    </div>
  );
}

