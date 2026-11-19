/**
 * server/src/knowledge/pdf-parser.ts
 * Implements Part C (PDF Parsing, text run scale/weight heuristics, XMP parsing via pdfjs-dist).
 */

import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { XMLParser } from 'fast-xml-parser';
import semver from 'semver';
import { z } from 'zod';

export type KnowledgeDomain = 'orders' | 'payments' | 'account';

export const semverStrictCanonicalSchema = z.string().superRefine((val, ctx) => {
  if (!/^\d+\.\d+(\.\d+)?$/.test(val.trim())) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `INVALID_VERSION_FORMAT: Version "${val}" must strictly follow "X.Y" or "X.Y.Z" numeric SemVer.`,
    });
    return;
  }
}).transform((val) => {
  const coerced = semver.coerce(val);
  return coerced ? coerced.version : val;
});

export const xmpMetadataSchema = z.object({
  docId: z.string().min(1),
  domain: z.enum(['orders', 'payments', 'account']),
  topic: z.string().min(1),
  documentType: z.enum(['policy', 'faq']),
  version: semverStrictCanonicalSchema,
  effectiveDate: z.string().datetime({ offset: true }).transform((s) => new Date(s)),
});

export type ExtractedPdfMetadata = z.infer<typeof xmpMetadataSchema>;

export interface RawTextRun {
  text: string;
  fontSize: number;
  isBold: boolean;
  pageNumber: number;
}

export interface ParsedSection {
  heading: string;
  level: number; // 1 = H1, 2 = H2, 3 = H3
  sectionPath: string;
  paragraphs: string[];
}

export interface ParsedPdfDocument {
  metadata: ExtractedPdfMetadata;
  sections: ParsedSection[];
}

export interface TextItemLike {
  str?: string;
  fontName?: string;
  transform?: number[];
}

export function resolveTextRunStyling(
  item: TextItemLike,
  styles: Record<string, { fontFamily?: string }>
): { fontSize: number; isBold: boolean } {
  // transform = [a, b, c, d, e, f]
  const [, , c, d] = item.transform || [1, 0, 0, 1, 0, 0];
  const fontSize = Math.abs(c ?? 0) < 1e-5 ? Math.abs(d ?? 1) : Math.hypot(c ?? 0, d ?? 1);

  let isBold = false;
  const fontStyle = item.fontName ? styles[item.fontName] : undefined;
  if (fontStyle?.fontFamily) {
    isBold = /bold|black|heavy|medium|semibold|700|800|900/i.test(fontStyle.fontFamily);
  }

  return { fontSize, isBold };
}

export async function parsePdfDocument(pdfBuffer: Buffer | Uint8Array): Promise<ParsedPdfDocument> {
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(pdfBuffer),
    useSystemFonts: true,
  });
  const pdfDoc = await loadingTask.promise;

  // 1. Extract XMP metadata from document metadata
  interface MetadataWithRaw {
    getRaw?: () => string;
    _data?: string;
    get?: (key: string) => string;
  }

  const metaObj = await pdfDoc.getMetadata();
  const metadataStream = metaObj.metadata as MetadataWithRaw | null | undefined;
  const rawXmp: string | undefined =
    typeof metadataStream?.getRaw === 'function'
      ? metadataStream.getRaw()
      : metadataStream?._data || metadataStream?.get?.('xmp');

  if (!rawXmp) {
    throw new Error('INGEST_ERROR_MISSING_XMP: Target PDF lacks an embedded XMP metadata packet.');
  }

  const xmlParser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    isArray: (name) => name === 'rdf:Description',
  });
  const xmpJson = xmlParser.parse(rawXmp);
  const descriptions = xmpJson['x:xmpmeta']?.['rdf:RDF']?.['rdf:Description'];
  if (!Array.isArray(descriptions)) {
    throw new Error('MALFORMED_XMP: Could not find rdf:Description array in XMP packet.');
  }

  const orchDesc = descriptions.find(
    (d: Record<string, unknown>) => d['@_xmlns:orch'] || d['orch:doc_id']
  ) as Record<string, unknown> | undefined;
  if (!orchDesc) {
    throw new Error('INGEST_ERROR_MISSING_ORCH_XMP: XMP packet missing xmlns:orch namespace block.');
  }

  const metadata = xmpMetadataSchema.parse({
    docId: orchDesc['orch:doc_id'],
    domain: orchDesc['orch:domain'],
    topic: orchDesc['orch:topic'],
    documentType: orchDesc['orch:document_type'],
    version: orchDesc['orch:doc_version'] || orchDesc['orch:version'],
    effectiveDate: orchDesc['orch:effective_date'],
  });

  // 2. Extract text runs and infer statistical font mode
  const allRuns: RawTextRun[] = [];
  const fontSizeCounts = new Map<number, number>();

  for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);
    const content = await page.getTextContent();
    const styles = content.styles as Record<string, { fontFamily?: string }>;

    for (const item of content.items) {
      if ('str' in item && item.str.trim().length > 0) {
        const { fontSize, isBold } = resolveTextRunStyling(item as TextItemLike, styles);
        allRuns.push({
          text: item.str.trim(),
          fontSize,
          isBold,
          pageNumber: pageNum,
        });

        const roundedSize = Math.round(fontSize * 10) / 10;
        fontSizeCounts.set(roundedSize, (fontSizeCounts.get(roundedSize) || 0) + item.str.length);
      }
    }
  }

  // Calculate body font mode (character-weighted so body paragraphs always dominate)
  let bodyFontSize = 8.25;
  let maxWeight = 0;
  for (const [size, weight] of fontSizeCounts.entries()) {
    if (weight > maxWeight) {
      maxWeight = weight;
      bodyFontSize = size;
    }
  }

  // 3. Classify runs into sections and paragraphs using heading heuristic
  const sections: ParsedSection[] = [];
  let currentSectionPath = `[Doc: ${metadata.docId} | Page 1]`;
  let currentH1 = '';
  let currentH2 = '';
  let currentSection: ParsedSection | null = null;

  for (const run of allRuns) {
    const s = run.fontSize;
    const isBold = run.isBold;

    // H1 check: >= 1.7 * body OR (>= 1.5 * body AND isBold)
    // In Chromium md-to-pdf: H1 is 16.5 (2.0x of 8.25)
    if (s >= 1.7 * bodyFontSize || (s >= 1.5 * bodyFontSize && isBold)) {
      if (currentSection && (currentSection.paragraphs.length > 0 || currentSection.heading !== 'Overview')) {
        sections.push(currentSection);
      }
      currentH1 = run.text;
      currentH2 = '';
      currentSectionPath = currentH1;
      currentSection = null; // Do not create an empty chunk for the top-level document title
      continue;
    }

    // H2 check: 1.25 * body <= s < 1.7 * body OR bold with size >= 1.2 * body OR clause prefix
    // In Chromium md-to-pdf: H2 is 12.375 (1.5x of 8.25)
    if (
      (s >= 1.25 * bodyFontSize && s < 1.7 * bodyFontSize) ||
      (s >= 1.2 * bodyFontSize && isBold) ||
      /^(Section|\d+\.0|[A-Z]\.)\s+/i.test(run.text)
    ) {
      // If we already have a currentSection that has no paragraphs, this run is a wrapped continuation of the H2 heading
      if (currentSection && currentSection.paragraphs.length === 0 && currentSection.level === 2) {
        currentSection.heading += ` ${run.text}`;
        currentSection.sectionPath = currentSection.heading;
        continue;
      }

      if (currentSection && currentSection.paragraphs.length > 0) {
        sections.push(currentSection);
      }
      currentH2 = run.text;
      currentSectionPath = currentH2;
      currentSection = {
        heading: run.text,
        level: 2,
        sectionPath: currentSectionPath,
        paragraphs: [],
      };
      continue;
    }

    // H3 check: 1.08 * body <= s < 1.25 * body OR subclause prefix
    if (
      (s >= 1.08 * bodyFontSize && s < 1.25 * bodyFontSize && isBold) ||
      /^(\d+\.\d+|[a-z]\))\s+/i.test(run.text)
    ) {
      if (currentSection && currentSection.paragraphs.length === 0 && currentSection.level === 3) {
        currentSection.heading += ` ${run.text}`;
        currentSection.sectionPath = currentH2 ? `${currentH2} > ${currentSection.heading}` : currentSection.heading;
        continue;
      }

      if (currentSection && currentSection.paragraphs.length > 0) {
        sections.push(currentSection);
      }
      const h3 = run.text;
      currentSectionPath = currentH2 ? `${currentH2} > ${h3}` : h3;
      currentSection = {
        heading: run.text,
        level: 3,
        sectionPath: currentSectionPath,
        paragraphs: [],
      };
      continue;
    }

    // Body text run
    if (!currentSection) {
      currentSection = {
        heading: currentH1 || 'Overview',
        level: 1,
        sectionPath: currentH1 || `[Doc: ${metadata.docId} | Page ${run.pageNumber}]`,
        paragraphs: [],
      };
    }
    currentSection.paragraphs.push(run.text);
  }

  if (currentSection && (currentSection.paragraphs.length > 0 || sections.length === 0)) {
    sections.push(currentSection);
  }

  await pdfDoc.cleanup();

  return { metadata, sections };
}
