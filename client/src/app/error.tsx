'use client';

// client/src/app/error.tsx
// Phase 19 Step 3: Route error boundary component for graceful client-side failure handling.
// Phase 30 Step 5: Dark design system styling.

import React, { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Unhandled client error in route boundary:', error);
  }, [error]);

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center p-6 text-center bg-surface-canvas">
      <div className="rounded-full bg-status-error-bg border border-status-error/30 p-4 text-status-error mb-4"
        style={{ backgroundColor: 'var(--status-error-bg)' }}>
        <AlertTriangle className="h-10 w-10" />
      </div>
      <h2 className="text-2xl font-bold tracking-tight text-content-primary">
        Something went wrong
      </h2>
      <p className="mt-2 max-w-md text-sm text-content-secondary">
        An unexpected error occurred while rendering this view. Your session and data remain safe.
      </p>
      {error?.message && (
        <div className="mt-4 max-w-lg rounded-card bg-surface-inset border border-edge-subtle p-3 text-xs font-mono text-content-muted">
          {error.message}
        </div>
      )}
      <div className="mt-6 flex items-center gap-3">
        <button
          onClick={() => reset()}
          className="inline-flex items-center gap-2 rounded-control bg-brand-primary px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          Try Again
        </button>
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-control border border-edge-subtle px-4 py-2 text-sm font-medium text-content-secondary hover:bg-surface-hover hover:text-content-primary transition-colors"
        >
          <Home className="h-4 w-4" />
          Return Home
        </Link>
      </div>
    </div>
  );
}
