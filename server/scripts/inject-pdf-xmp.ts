/**
 * scripts/inject-pdf-xmp.ts
 * Implements Part B & Round 4/5 XMP injection with Adobe xpacket wrapping,
 * recursive /Sig field checking, uncompressed metadata stream, and stream ref cleanup.
 *
 * Pre-flight Check Results (ESM node --input-type=module):
 * PDFContext: [ 'register', 'delete', 'lookup', 'stream', 'flateStream' ]
 * PDFRawStream: [ 'asUint8Array', 'getContentsString', 'getContents' ]
 * PDFFlateStream: [ 'getContents', 'getUnencodedContents' ]
 * PDFDict: [ 'set', 'get', 'lookup' ]
 * PDFName: [ 'decodeText', 'asString', 'value' ]
 * Context Stream: Is PDFRawStream: true, Has Filter: false
 * Context Delete: Registered: true, After delete: true
 * Stream Decoding: Raw readable: true, Flate readable: true
 */

import {
  PDFDocument,
  PDFName,
  PDFRef,
  PDFDict,
  PDFArray,
  PDFRawStream,
} from 'pdf-lib';
import zlib from 'zlib';
import { XMLParser, XMLBuilder } from 'fast-xml-parser';

export interface XmpMetadataPayload {
  docId: string;
  domain: string;
  topic: string;
  version: string;
  effectiveDate: string;
  documentType: string;
}

export async function injectOrchestraiXmp(
  pdfBuffer: Buffer | Uint8Array,
  meta: XmpMetadataPayload
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const catalog = pdfDoc.catalog;

  // 1. Recursive Signature Check: Inspect AcroForm SigFlags and recursive /Sig fields
  const acroFormRef = catalog.get(PDFName.of('AcroForm'));
  if (acroFormRef) {
    const acroForm = pdfDoc.context.lookup(acroFormRef);
    if (acroForm instanceof PDFDict) {
      // Check SigFlags bitmask (bit 1: SignaturesExist, bit 2: AppendOnly)
      const sigFlagsRef = acroForm.get(PDFName.of('SigFlags'));
      const sigFlags = sigFlagsRef ? pdfDoc.context.lookup(sigFlagsRef) : undefined;
      if (sigFlags && typeof (sigFlags as any).asNumber === 'function') {
        const flags = (sigFlags as any).asNumber();
        if (flags & 1 || flags & 2) {
          throw new Error(
            'INGEST_ERROR_SIGNED_PDF: Document has active AcroForm SigFlags; modifying XMP would invalidate signatures.'
          );
        }
      }

      // Check for /Sig field types recursively across /Fields array
      const hasSigField = (entry: any): boolean => {
        if (!entry) return false;
        const dict = entry instanceof PDFDict ? entry : pdfDoc.context.lookup(entry);
        if (!(dict instanceof PDFDict)) return false;

        const ftRef = dict.get(PDFName.of('FT'));
        const ft = ftRef ? pdfDoc.context.lookup(ftRef) : undefined;
        if (ft && typeof (ft as any).asString === 'function' && (ft as any).asString() === '/Sig') {
          return true;
        }

        const kidsRef = dict.get(PDFName.of('Kids'));
        const kids = kidsRef ? pdfDoc.context.lookup(kidsRef) : undefined;
        if (kids instanceof PDFArray) {
          for (let i = 0; i < kids.size(); i++) {
            if (hasSigField(kids.get(i))) return true;
          }
        }
        return false;
      };

      const fieldsRef = acroForm.get(PDFName.of('Fields'));
      const fields = fieldsRef ? pdfDoc.context.lookup(fieldsRef) : undefined;
      if (fields instanceof PDFArray) {
        for (let i = 0; i < fields.size(); i++) {
          if (hasSigField(fields.get(i))) {
            throw new Error(
              'INGEST_ERROR_SIGNED_PDF: Document contains an interactive signature field (/FT /Sig).'
            );
          }
        }
      }
    }
  }

  // 2. Read existing XMP stream bytes using the verified type-safe API
  let existingXmpXml: string | null = null;
  const oldRef = catalog.get(PDFName.of('Metadata'));
  if (oldRef) {
    const stream = pdfDoc.context.lookup(oldRef);
    if (stream instanceof PDFRawStream) {
      const filter = stream.dict.get(PDFName.of('Filter'));
      if (!filter) {
        existingXmpXml = Buffer.from(stream.getContents()).toString('utf8');
      } else {
        const filterName = filter instanceof PDFName ? filter.asString() : String(filter);
        if (filterName === '/FlateDecode') {
          existingXmpXml = zlib.inflateSync(Buffer.from(stream.getContents())).toString('utf8');
        } else {
          throw new Error(`UNSUPPORTED_METADATA_FILTER: Existing metadata stream has unsupported filter: ${filterName}`);
        }
      }
    }
  }

  // 3. Extract & preserve outer Adobe xpacket processing instructions
  const begin = existingXmpXml?.match(/<\?xpacket begin="([^"]*)"\?>/)?.[1] ?? '\uFEFF';
  const end = existingXmpXml?.match(/<\?xpacket end="([^"]*)"\?>/)?.[1] ?? 'w';

  // 4. Parse & Validate Shape
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    isArray: (name) => name === 'rdf:Description',
  });

  let xmpDoc: any;
  if (existingXmpXml && existingXmpXml.trim().length > 0) {
    xmpDoc = parser.parse(existingXmpXml);
    if (!xmpDoc['x:xmpmeta'] || !xmpDoc['x:xmpmeta']['rdf:RDF']) {
      throw new Error('MALFORMED_XMP_STRUCTURE: Existing XMP packet lacks standard x:xmpmeta or rdf:RDF root.');
    }
  } else {
    xmpDoc = {
      'x:xmpmeta': {
        '@_xmlns:x': 'adobe:ns:meta/',
        'rdf:RDF': {
          '@_xmlns:rdf': 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
          'rdf:Description': [],
        },
      },
    };
  }

  const rdf = xmpDoc['x:xmpmeta']['rdf:RDF'];
  if (!Array.isArray(rdf['rdf:Description'])) {
    rdf['rdf:Description'] = rdf['rdf:Description'] ? [rdf['rdf:Description']] : [];
  }

  // 5. Idempotently update orch namespace description
  let targetDesc = rdf['rdf:Description'].find((d: any) => d['@_xmlns:orch']);
  if (!targetDesc) {
    targetDesc = {
      '@_rdf:about': '',
      '@_xmlns:orch': 'http://orchestrai.ai/schema/1.0/',
      '@_xmlns:dc': 'http://purl.org/dc/elements/1.1/',
    };
    rdf['rdf:Description'].push(targetDesc);
  }

  targetDesc['orch:doc_id'] = meta.docId;
  targetDesc['orch:domain'] = meta.domain;
  targetDesc['orch:topic'] = meta.topic;
  targetDesc['orch:doc_version'] = meta.version;
  targetDesc['orch:version'] = meta.version;
  targetDesc['orch:effective_date'] = meta.effectiveDate;
  targetDesc['orch:document_type'] = meta.documentType;
  targetDesc['dc:identifier'] = meta.docId;

  // 6. Build inner XML and wrap in strict Adobe processing instructions
  const builder = new XMLBuilder({ ignoreAttributes: false, attributeNamePrefix: '@_', format: true });
  const innerXml = builder.build(xmpDoc);
  const fullPacket = `<?xpacket begin="${begin}"?>\n${innerXml}\n<?xpacket end="${end}"?>`;

  // 7. Delete orphaned stream object before overwriting pointer
  if (oldRef instanceof PDFRef) {
    pdfDoc.context.delete(oldRef);
  }

  // 8. Write uncompressed PDFRawStream with PDFName keys (must encode as UTF-8 Uint8Array so BOM is EF BB BF)
  const packetBytes = new TextEncoder().encode(fullPacket);
  const metadataStream = pdfDoc.context.stream(packetBytes, {
    Type: PDFName.of('Metadata'),
    Subtype: PDFName.of('XML'),
  });
  const metadataStreamRef = pdfDoc.context.register(metadataStream);
  catalog.set(PDFName.of('Metadata'), metadataStreamRef);

  return pdfDoc.save();
}
