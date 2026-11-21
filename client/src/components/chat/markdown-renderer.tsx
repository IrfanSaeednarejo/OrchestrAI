// src/components/chat/markdown-renderer.tsx
// Phase 17 Step 5a: Security-hardened Markdown renderer.
// Phase 30 Step 4: Dark theme prose styling. Sanitization logic is UNCHANGED.

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownRendererProps {
  content: string;
}

/**
 * Sanitizes URLs to prevent XSS via javascript: or data: schemes.
 */
function sanitizeUrl(url?: string): string {
  if (!url) return '#';
  const trimmed = url.trim().toLowerCase();
  if (
    trimmed.startsWith('javascript:') ||
    trimmed.startsWith('vbscript:') ||
    trimmed.startsWith('data:')
  ) {
    return '#';
  }
  return url;
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <div className="prose prose-sm max-w-none break-words text-content-primary leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Security: Links must be sanitized and open in new tab with noopener
          a: ({ href, children, ...props }) => {
            const safeHref = sanitizeUrl(href);
            return (
              <a
                href={safeHref}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-link underline hover:text-white font-medium"
                {...props}
              >
                {children}
              </a>
            );
          },
          // Security: Remote images are rendered as safe text links, never autoloaded
          img: ({ src, alt }) => {
            const safeSrc = sanitizeUrl(src);
            return (
              <span className="inline-block my-1 text-xs text-content-muted bg-surface-inset border border-edge-subtle rounded px-2 py-1">
                Image: <a href={safeSrc} target="_blank" rel="noopener noreferrer" className="text-brand-link underline">{alt || safeSrc}</a>
              </span>
            );
          },
          // Clean typography for lists, tables, code
          ul: ({ children }) => <ul className="list-disc pl-5 my-2 space-y-1 text-content-primary">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-5 my-2 space-y-1 text-content-primary">{children}</ol>,
          table: ({ children }) => (
            <div className="overflow-x-auto my-2">
              <table className="min-w-full divide-y divide-edge-subtle text-xs border border-edge-subtle">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="px-3 py-1.5 bg-surface-elevated text-left font-semibold text-content-secondary border-b border-edge-subtle">{children}</th>
          ),
          td: ({ children }) => (
            <td className="px-3 py-1.5 border-b border-edge-subtle text-content-primary">{children}</td>
          ),
          code: ({ children, className }) => {
            const isInline = !className;
            if (isInline) {
              return (
                <code className="bg-surface-inset text-brand-link rounded px-1.5 py-0.5 text-xs font-mono">
                  {children}
                </code>
              );
            }
            return (
              <pre className="bg-surface-inset text-content-secondary rounded-card p-3 my-2 text-xs font-mono overflow-x-auto border border-edge-subtle">
                <code>{children}</code>
              </pre>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
