// src/components/chat/markdown-renderer.test.tsx
// Phase 17 Step 5a: Tests for Markdown security, links, images, tables, raw HTML.

import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MarkdownRenderer } from './markdown-renderer';

describe('MarkdownRenderer Security & Formatting', () => {
  it('renders standard markdown text and lists', () => {
    const md = 'Here is a list:\n- Item 1\n- Item 2';
    render(<MarkdownRenderer content={md} />);

    expect(screen.getByText('Here is a list:')).toBeInTheDocument();
    expect(screen.getByText('Item 1')).toBeInTheDocument();
    expect(screen.getByText('Item 2')).toBeInTheDocument();
  });

  it('renders GFM tables correctly', () => {
    const md = '| Header 1 | Header 2 |\n| --- | --- |\n| Cell 1 | Cell 2 |';
    render(<MarkdownRenderer content={md} />);

    expect(screen.getByText('Header 1')).toBeInTheDocument();
    expect(screen.getByText('Cell 1')).toBeInTheDocument();
  });

  it('enforces target="_blank" and rel="noopener noreferrer" on links', () => {
    const md = 'Visit [Example](https://example.com) for details.';
    render(<MarkdownRenderer content={md} />);

    const link = screen.getByRole('link', { name: 'Example' });
    expect(link).toHaveAttribute('href', 'https://example.com');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('neutralizes dangerous javascript: URLs to #', () => {
    const md = '[Click me](javascript:alert("XSS"))';
    render(<MarkdownRenderer content={md} />);

    const link = screen.getByRole('link', { name: 'Click me' });
    expect(link).toHaveAttribute('href', '#');
  });

  it('does not autoload remote images; renders them as safe text links', () => {
    const md = '![Alt Text](https://example.com/danger.png)';
    const { container } = render(<MarkdownRenderer content={md} />);

    // No <img> tag should exist
    expect(container.querySelector('img')).toBeNull();

    // Link with alt text should be rendered instead
    const link = screen.getByRole('link', { name: 'Alt Text' });
    expect(link).toHaveAttribute('href', 'https://example.com/danger.png');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('disallows raw HTML and does not render unescaped elements', () => {
    const md = '<script>alert("evil")</script><b>Bold Text</b>';
    const { container } = render(<MarkdownRenderer content={md} />);

    // Script tag must not be injected
    expect(container.querySelector('script')).toBeNull();
  });
});

