/**
 * scripts/generate-large-doc-pdf.ts
 * Generates test-fixtures/large-doc/large-doc.pdf — a synthetic ~40-page policy
 * document with real ## / ### headings for section-level chunking tests.
 * Uses domain: 'orders', topic: 'large_doc_test' so ingest scopes it correctly.
 *
 * DEFERRED: multi-column layout, TOC, wrapped headings.
 * md-to-pdf does not support multi-column as a native option.
 * Chunk-count target for B.5 is > 30 (not > 200).
 */

import fs from 'fs';
import path from 'path';
import { mdToPdf } from 'md-to-pdf';
import { injectOrchestraiXmp, XmpMetadataPayload } from './inject-pdf-xmp.js';

const OUT_DIR = path.resolve(process.cwd(), 'test-fixtures/large-doc');
const OUT_FILE = path.join(OUT_DIR, 'large-doc.pdf');

function findBrowserExecutable(): string | undefined {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  const candidates = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return undefined;
}

/** Build a large markdown body with real ##/### hierarchy */
function buildMarkdownBody(): string {
  const sections = [
    'Return Eligibility',
    'Return Window Calculation',
    'Eligible Order Statuses',
    'Concurrent Return Limits',
    'Item Condition Requirements',
    'Non-Returnable Items',
    'Digital Products Policy',
    'Perishable Goods Policy',
    'Hazardous Materials',
    'Return Shipping',
    'Prepaid Labels',
    'Self-Ship Returns',
    'International Returns',
    'Refund Timing',
    'Original Payment Method',
    'Store Credit Option',
    'Partial Refunds',
    'Duplicate Charge Refunds',
    'Refund Disputes',
    'Exchange Process',
    'Defective Item Exchanges',
    'Size and Fit Exchanges',
  ];
  const subsections = ['Overview', 'Requirements', 'Exceptions', 'Contact Support'];

  let md = '# Large Document Fixture — Orders Policy\n\n';
  md +=
    'This document is a synthetic test fixture for the OrchestrAI large-document ingestion benchmark.\n\n';

  for (const section of sections) {
    md += `## ${section}\n\n`;
    md += `This section covers all aspects of **${section.toLowerCase()}** as defined by OrchestrAI's customer order policy. `;
    md += `Customers should review this section carefully before initiating any ${section.toLowerCase()}-related request. `;
    md += `Our policy is designed to be fair, transparent, and consistent across all order types.\n\n`;

    for (const sub of subsections) {
      md += `### ${section} — ${sub}\n\n`;
      md += `The ${sub.toLowerCase()} for ${section.toLowerCase()} applies to all standard orders placed through the OrchestrAI platform. `;
      md += `Exceptions may apply for orders placed during promotional periods, international shipments, or orders containing restricted items. `;
      md += `For specific questions, customers should contact our support team with their order ID and a description of their situation.\n\n`;
    }
  }

  return md;
}

async function main(): Promise<void> {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const markdownBody = buildMarkdownBody();
  const browserExecutable = findBrowserExecutable();
  const launchOptions = browserExecutable
    ? { executablePath: browserExecutable, args: ['--no-sandbox', '--disable-setuid-sandbox'] }
    : { args: ['--no-sandbox', '--disable-setuid-sandbox'] };

  console.log('[generate-large-doc-pdf] Rendering markdown to PDF...');
  const rendered = await mdToPdf(
    { content: markdownBody },
    {
      launch_options: launchOptions,
      pdf_options: {
        format: 'A4',
        margin: { top: '20mm', bottom: '20mm', left: '20mm', right: '20mm' },
      },
    }
  );

  if (!rendered?.content) {
    throw new Error('mdToPdf returned no content');
  }

  const xmpPayload: XmpMetadataPayload = {
    docId: 'test-orders-large-doc-001',
    domain: 'orders',
    topic: 'large_doc_test',
    version: '1.0.0',
    effectiveDate: new Date().toISOString(),
    documentType: 'policy',
  };

  console.log('[generate-large-doc-pdf] Injecting XMP metadata...');
  const injected = await injectOrchestraiXmp(rendered.content, xmpPayload);
  fs.writeFileSync(OUT_FILE, injected);
  console.log(`[generate-large-doc-pdf] Wrote ${OUT_FILE} (${injected.length} bytes)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
