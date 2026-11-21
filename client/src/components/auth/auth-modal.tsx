'use client';

// src/components/auth/auth-modal.tsx
// Phase 33: Authentication modal for Sign In and Register with Midnight Burgundy / Imperial Crimson design system.

import React, { useState } from 'react';
import { X, Lock, Mail, User, MapPin, Loader2, AlertCircle } from 'lucide-react';
import { useAuth } from '../../context/auth-context';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function AuthModal({ isOpen, onClose, onSuccess }: AuthModalProps) {
  const { login, register, error: authError, clearError } = useAuth();
  const [tab, setTab] = useState<'login' | 'register'>('login');

  // Form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [defaultAddress, setDefaultAddress] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSwitchTab = (newTab: 'login' | 'register') => {
    setTab(newTab);
    setFormError(null);
    clearError();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    clearError();

    if (!email.trim() || !password) {
      setFormError('Email and password are required');
      return;
    }

    if (tab === 'register') {
      if (!name.trim()) {
        setFormError('Name is required');
        return;
      }
      if (!defaultAddress.trim()) {
        setFormError('Default shipping address is required');
        return;
      }
      if (password.length < 8) {
        setFormError('Password must be at least 8 characters');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      if (tab === 'login') {
        await login(email.trim(), password);
      } else {
        await register({
          email: email.trim(),
          name: name.trim(),
          defaultAddress: defaultAddress.trim(),
          password,
        });
      }
      onSuccess?.();
      onClose();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const displayError = formError || authError;

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-testid="auth-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-surface-canvas/80 backdrop-blur-sm p-4 animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-md bg-surface border border-edge-subtle rounded-dialog shadow-elevated p-6 sm:p-7 text-content-primary selection:bg-brand-primary/30 selection:text-white">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          data-testid="auth-modal-close"
          aria-label="Close modal"
          className="absolute top-4 right-4 p-1.5 rounded-control text-content-muted hover:text-content-primary hover:bg-surface-inset border border-transparent hover:border-edge-subtle transition-colors cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Modal Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-brand-primary/10 border border-brand-primary/20 text-brand-link mb-3 shadow-glow-brand">
            <Lock className="h-5 w-5" />
          </div>
          <h2 className="text-xl font-bold text-content-primary tracking-tight">
            {tab === 'login' ? 'Sign In to OrchestrAI' : 'Create Customer Account'}
          </h2>
          <p className="text-xs text-content-secondary mt-1">
            {tab === 'login'
              ? 'Access your orders and converse with support agents.'
              : 'Register to place orders and manage your account.'}
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-edge-subtle mb-6">
          <button
            type="button"
            onClick={() => handleSwitchTab('login')}
            data-testid="tab-sign-in"
            className={`flex-1 pb-2.5 text-sm font-medium transition-all border-b-2 cursor-pointer ${
              tab === 'login'
                ? 'border-brand-link text-brand-link font-semibold'
                : 'border-transparent text-content-muted hover:text-content-secondary'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => handleSwitchTab('register')}
            data-testid="tab-register"
            className={`flex-1 pb-2.5 text-sm font-medium transition-all border-b-2 cursor-pointer ${
              tab === 'register'
                ? 'border-brand-link text-brand-link font-semibold'
                : 'border-transparent text-content-muted hover:text-content-secondary'
            }`}
          >
            Create Account
          </button>
        </div>

        {/* Error Feedback */}
        {displayError && (
          <div
            data-testid="auth-error-banner"
            role="alert"
            className="mb-4 p-3 rounded-control bg-status-error/10 border border-status-error/25 text-status-error text-xs font-medium flex items-start gap-2.5"
          >
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span className="leading-relaxed">{displayError}</span>
          </div>
        )}

        {/* Auth Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {tab === 'register' && (
            <>
              <div>
                <label className="block text-xs font-semibold text-content-secondary mb-1.5">
                  Full Name
                </label>
                <div className="relative">
                  <User className="absolute left-3.5 top-3 h-4 w-4 text-content-muted pointer-events-none" />
                  <input
                    type="text"
                    required
                    data-testid="auth-name-input"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Jane Doe"
                    className="w-full pl-10 pr-3.5 py-2 text-sm bg-surface-inset border border-edge-subtle rounded-control text-content-primary placeholder-content-muted focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary/30 transition-all font-sans"
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
                    data-testid="auth-address-input"
                    value={defaultAddress}
                    onChange={(e) => setDefaultAddress(e.target.value)}
                    placeholder="123 Market St, Suite 400"
                    className="w-full pl-10 pr-3.5 py-2 text-sm bg-surface-inset border border-edge-subtle rounded-control text-content-primary placeholder-content-muted focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary/30 transition-all font-sans"
                  />
                </div>
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-semibold text-content-secondary mb-1.5">
              Email Address
            </label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-3 h-4 w-4 text-content-muted pointer-events-none" />
              <input
                type="email"
                required
                data-testid="auth-email-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full pl-10 pr-3.5 py-2 text-sm bg-surface-inset border border-edge-subtle rounded-control text-content-primary placeholder-content-muted focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary/30 transition-all font-sans"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-content-secondary mb-1.5">
              Password {tab === 'register' && <span className="text-content-muted font-normal">(min 8 chars)</span>}
            </label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-3 h-4 w-4 text-content-muted pointer-events-none" />
              <input
                type="password"
                required
                data-testid="auth-password-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-3.5 py-2 text-sm bg-surface-inset border border-edge-subtle rounded-control text-content-primary placeholder-content-muted focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary/30 transition-all font-sans"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            data-testid="auth-submit-btn"
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-control bg-brand-primary hover:bg-brand-hover active:bg-brand-deep text-white font-medium text-sm transition-all shadow-glow-brand hover:shadow-glow-brand-lg disabled:opacity-50 disabled:pointer-events-none mt-6 cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{tab === 'login' ? 'Signing in...' : 'Creating account...'}</span>
              </>
            ) : (
              <span>{tab === 'login' ? 'Sign In' : 'Create Account'}</span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
