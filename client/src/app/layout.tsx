import type { Metadata } from 'next';
import { Manrope } from 'next/font/google';
import './globals.css';
import { Providers } from '../components/providers';

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'OrchestrAI — Support Chat & Store',
  description: 'Autonomous multi-agent customer support orchestration and commerce',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={manrope.variable}>
      <body className="bg-surface-canvas text-content-primary font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
