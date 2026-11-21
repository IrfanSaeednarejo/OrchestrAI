'use client';

// src/components/chat/service-option-bar.tsx
// Phase 23: Interactive service-option pill buttons rendered beneath the assistant
// greeting message.
// Phase 30 Step 4: Design system redesign — Crimson-toned pills on dark surface.

import React from 'react';
import type { ServiceOption } from '../../types/api';

interface ServiceOptionBarProps {
  options: ServiceOption[];
  onSelect: (message: string) => void;
  isStreaming?: boolean;
  isEscalated?: boolean;
}

export function ServiceOptionBar({
  options,
  onSelect,
  isStreaming = false,
  isEscalated = false,
}: ServiceOptionBarProps) {
  if (!options || options.length === 0) return null;

  const isDisabled = isStreaming || isEscalated;

  return (
    <div
      data-testid="service-option-bar"
      className="flex flex-wrap gap-2 mt-3"
    >
      {options.map((option) => (
        <button
          key={option.label}
          type="button"
          disabled={isDisabled}
          onClick={() => onSelect(option.message)}
          data-testid={`service-option-${option.label.replace(/\s+/g, '-').toLowerCase()}`}
          className={
            'inline-flex items-center px-3.5 py-1.5 rounded-tag text-xs font-medium ' +
            'border transition-colors focus:outline-none focus:ring-2 focus:ring-brand-focus focus:ring-offset-1 focus:ring-offset-surface-canvas ' +
            (isDisabled
              ? 'border-edge-subtle bg-surface text-content-disabled cursor-not-allowed'
              : 'border-brand-mid bg-brand-deep text-brand-link hover:bg-brand-primary hover:border-brand-primary hover:text-white cursor-pointer')
          }
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
