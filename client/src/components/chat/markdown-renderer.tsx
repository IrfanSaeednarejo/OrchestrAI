// src/components/chat/markdown-renderer.tsx
// Phase 17 Step 5a: Security-hardened Markdown renderer.

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
    <div className="prose prose-sm max-w-none break-words text-slate-800 leading-relaxed">
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
                className="text-blue-600 underline hover:text-blue-800 font-medium"
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
              <span className="inline-block my-1 text-xs text-slate-500 bg-slate-100 border border-slate-300 rounded px-2 py-1">
                Image: <a href={safeSrc} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">{alt || safeSrc}</a>
              </span>
            );
          },
          // Clean typography for lists, tables, code
          ul: ({ children }) => <ul className="list-disc pl-5 my-2 space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-5 my-2 space-y-1">{children}</ol>,
          table: ({ children }) => (
            <div className="overflow-x-auto my-2">
              <table className="min-w-full divide-y divide-slate-200 text-xs border border-slate-200">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="px-3 py-1.5 bg-slate-100 text-left font-semibold text-slate-700 border-b">{children}</th>
          ),
          td: ({ children }) => (
            <td className="px-3 py-1.5 border-b border-slate-200">{children}</td>
          ),
          code: ({ children, className }) => {
            const isInline = !className;
            if (isInline) {
              return (
                <code className="bg-slate-100 text-slate-800 rounded px-1.5 py-0.5 text-xs font-mono">
                  {children}
                </code>
              );
            }
            return (
              <pre className="bg-slate-900 text-slate-100 rounded-md p-3 my-2 text-xs font-mono overflow-x-auto">
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
