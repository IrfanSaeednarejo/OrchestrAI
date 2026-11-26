/**
 * scripts/generate-policy-pdfs.ts
 * Generates the 5 canonical policy PDFs from Markdown source fixtures in docs/knowledge-base/src/*.md,
 * renders them using md-to-pdf, and injects compliant Adobe XMP metadata.
 */

import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { mdToPdf } from 'md-to-pdf';
import { injectOrchestraiXmp, XmpMetadataPayload } from './inject-pdf-xmp.js';
import { xmpMetadataSchema } from '../src/knowledge/pdf-parser.js';

const SRC_DIR = path.resolve(process.cwd(), '../docs/knowledge-base/src');
const OUTPUT_DIR = path.resolve(process.cwd(), '../docs/knowledge-base');

const FROZEN_FILES = new Set([
  'account-security-faq.md',
  'cancellations.md',
  'data-deletion.md',
  'disputes.md',
  'exchanges.md',
  'methods.md',
  'notifications.md',
  'payments-faq.md',
  'privacy.md',
  'refunds-policy.md',
  'returns-policy.md',
  'shipping-faq.md',
]);

function findBrowserExecutable(): string | undefined {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }
  const candidatePaths = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
  ];

  for (const candidate of candidatePaths) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

export async function generatePolicyPdfs(): Promise<void> {
  if (!fs.existsSync(SRC_DIR)) {
    throw new Error(`Source directory does not exist: ${SRC_DIR}`);
  }
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const newOnly = process.argv.includes('--new-only');
  const files = fs
    .readdirSync(SRC_DIR)
    .filter((f) => f.endsWith('.md'))
    .filter((f) => !newOnly || !FROZEN_FILES.has(f));
  if (files.length === 0) {
    throw new Error(`No markdown files found in ${SRC_DIR}`);
  }

  const browserExecutable = findBrowserExecutable();

  for (const file of files) {
    const filePath = path.join(SRC_DIR, file);
    const rawContent = fs.readFileSync(filePath, 'utf-8');
    const { data: frontmatter, content: markdownBody } = matter(rawContent);

    // Validate frontmatter matches XMP metadata schema
    const parsedMeta = xmpMetadataSchema.parse({
      ...frontmatter,
      effectiveDate:
        typeof frontmatter.effectiveDate === 'string'
          ? frontmatter.effectiveDate
          : frontmatter.effectiveDate instanceof Date
            ? frontmatter.effectiveDate.toISOString()
            : String(frontmatter.effectiveDate),
    });

    const xmpPayload: XmpMetadataPayload = {
      docId: parsedMeta.docId,
      domain: parsedMeta.domain,
      topic: parsedMeta.topic,
      version: parsedMeta.version,
      effectiveDate: parsedMeta.effectiveDate.toISOString(),
      documentType: parsedMeta.documentType,
      title: (frontmatter.title as string) || path.basename(file, '.md'),
    };

    console.log(`[generate-policy-pdfs] Rendering ${file} (${xmpPayload.docId})...`);

    const launchOptions = browserExecutable
      ? { executablePath: browserExecutable, args: ['--no-sandbox', '--disable-setuid-sandbox'] }
      : { args: ['--no-sandbox', '--disable-setuid-sandbox'] };

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

    if (!rendered || !rendered.content) {
      throw new Error(`Failed to render PDF for ${file}: no content produced.`);
    }

    const injectedPdf = await injectOrchestraiXmp(rendered.content, xmpPayload);

    const outFileName = file.replace(/\.md$/, '.pdf');
    const outPath = path.join(OUTPUT_DIR, outFileName);
    fs.writeFileSync(outPath, injectedPdf);
    console.log(`[generate-policy-pdfs] Wrote ${outPath} (${injectedPdf.length} bytes)`);
  }
}

// Auto-run if executed directly
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename ?? '')) {
  generatePolicyPdfs().catch((err) => {
    console.error('Error generating policy PDFs:', err);
    process.exit(1);
  });
}
