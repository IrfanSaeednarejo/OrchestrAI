'use client';

// client/src/app/global-error.tsx
// Phase 19 Step 3: Root global error boundary that catches errors in the root layout.

import React from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col items-center justify-center bg-neutral-50 p-6 text-neutral-900 font-sans">
        <div className="max-w-md rounded-xl border border-neutral-200 bg-white p-8 shadow-sm text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600">
            ⚠️
          </div>
          <h1 className="text-xl font-bold">Application Error</h1>
          <p className="mt-2 text-sm text-neutral-600">
            A critical error occurred in the application root. Please reload or try again.
          </p>
          {error?.message && (
            <pre className="mt-4 max-h-32 overflow-auto rounded bg-neutral-100 p-2 text-left text-xs text-neutral-700">
              {error.message}
            </pre>
          )}
          <div className="mt-6 flex justify-center gap-3">
            <button
              onClick={() => reset()}
              className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 transition"
            >
              Try Again
            </button>
            <button
              onClick={() => {
                window.location.href = '/';
              }}
              className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition"
            >
              Reload App
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}

