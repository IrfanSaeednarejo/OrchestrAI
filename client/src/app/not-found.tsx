// client/src/app/not-found.tsx
// Phase 19 Step 3: Global 404 page for unmatched URLs.

import React from 'react';
import Link from 'next/link';
import { Compass, Home } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center p-6 text-center">
      <div className="rounded-full bg-neutral-100 p-4 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400 mb-4">
        <Compass className="h-10 w-10 animate-pulse" />
      </div>
      <h2 className="text-3xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
        404 - Page Not Found
      </h2>
      <p className="mt-2 max-w-md text-sm text-neutral-600 dark:text-neutral-400">
        The page or route you are looking for does not exist or has been moved.
      </p>
      <div className="mt-6 flex items-center gap-3">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 transition dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          <Home className="h-4 w-4" />
          Back to Support Chat
        </Link>
        <Link
          href="/ops"
          className="inline-flex items-center gap-2 rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          Ops Dashboard
        </Link>
      </div>
    </div>
  );
}

