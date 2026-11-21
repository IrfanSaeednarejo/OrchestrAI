// client/src/app/not-found.tsx
// Phase 19 Step 3: Global 404 page for unmatched URLs.
// Phase 30 Step 5: Dark design system styling.

import React from 'react';
import Link from 'next/link';
import { Compass, Home } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center p-6 text-center bg-surface-canvas">
      <div className="rounded-full bg-surface-elevated border border-edge-subtle p-4 text-content-muted mb-4">
        <Compass className="h-10 w-10 animate-pulse" />
      </div>
      <h2 className="text-3xl font-bold tracking-tight text-content-primary">
        404 - Page Not Found
      </h2>
      <p className="mt-2 max-w-md text-sm text-content-secondary">
        The page or route you are looking for does not exist or has been moved.
      </p>
      <div className="mt-6 flex items-center gap-3">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-control bg-brand-primary px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover transition-colors"
        >
          <Home className="h-4 w-4" />
          Back to Support Chat
        </Link>
        <Link
          href="/ops"
          className="inline-flex items-center gap-2 rounded-control border border-edge-subtle px-4 py-2 text-sm font-medium text-content-secondary hover:bg-surface-hover hover:text-content-primary transition-colors"
        >
          Ops Dashboard
        </Link>
      </div>
    </div>
  );
}
