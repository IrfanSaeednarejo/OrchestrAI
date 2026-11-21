import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)'],
        mono: ['var(--font-mono)'],
      },
      colors: {
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        brand: {
          primary: 'var(--brand-primary)',
          hover: 'var(--brand-hover)',
          focus: 'var(--brand-focus)',
          mid: 'var(--brand-mid)',
          deep: 'var(--brand-deep)',
          link: 'var(--brand-link)',
        },
        surface: {
          canvas: 'var(--bg-canvas)',
          sidebar: 'var(--bg-sidebar)',
          DEFAULT: 'var(--bg-surface)',
          elevated: 'var(--bg-elevated)',
          hover: 'var(--bg-hover)',
          inset: 'var(--bg-inset)',
        },
        content: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          muted: 'var(--text-muted)',
          disabled: 'var(--text-disabled)',
        },
        edge: {
          subtle: 'var(--border-subtle)',
          strong: 'var(--border-strong)',
          focus: 'var(--border-focus)',
        },
        status: {
          success: 'var(--status-success)',
          warning: 'var(--status-warning)',
          error: 'var(--status-error)',
          info: 'var(--status-info)',
          active: 'var(--status-active)',
        },
      },
      borderRadius: {
        dialog: '12px',
        card: '10px',
        message: '10px',
        control: '8px',
        tag: '6px',
      },
    },
  },
  plugins: [],
};

export default config;
