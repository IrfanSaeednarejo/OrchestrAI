'use client';

// src/components/chat/service-option-bar.tsx
// Phase 23: Interactive service-option pill buttons rendered beneath the assistant
// greeting message. Clicking a button fires sendMessage with the option's preset message,
// letting users select a service without having to type manually.

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
            'inline-flex items-center px-3.5 py-1.5 rounded-full text-xs font-medium ' +
            'border transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-1 ' +
            (isDisabled
              ? 'border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed'
              : 'border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 hover:border-indigo-300 cursor-pointer')
          }
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

