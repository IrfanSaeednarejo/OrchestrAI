'use client';

// client/src/app/error.tsx
// Phase 19 Step 3: Route error boundary component for graceful client-side failure handling.

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
    <div className="flex min-h-[70vh] flex-col items-center justify-center p-6 text-center">
      <div className="rounded-full bg-red-100 p-4 text-red-600 dark:bg-red-950 dark:text-red-400 mb-4">
        <AlertTriangle className="h-10 w-10" />
      </div>
      <h2 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
        Something went wrong
      </h2>
      <p className="mt-2 max-w-md text-sm text-neutral-600 dark:text-neutral-400">
        An unexpected error occurred while rendering this view. Your session and data remain safe.
      </p>
      {error?.message && (
        <div className="mt-4 max-w-lg rounded-md bg-neutral-100 p-3 text-xs font-mono text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
          {error.message}
        </div>
      )}
      <div className="mt-6 flex items-center gap-3">
        <button
          onClick={() => reset()}
          className="inline-flex items-center gap-2 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 transition dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          <RefreshCw className="h-4 w-4" />
          Try Again
        </button>
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          <Home className="h-4 w-4" />
          Return Home
        </Link>
      </div>
    </div>
  );
}

