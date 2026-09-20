import 'dotenv/config';
import { db } from '../persistence/db/client.js';
import { knowledgeDocuments } from '../persistence/db/schema.js';
import { createKnowledgeDocument } from '../persistence/repositories/knowledge.repository.js';
import { embedDocument } from './embeddings-client.js';
import { policyDocuments } from './documents.js';

async function main() {
  console.log('--- Knowledge Ingestion: Start ---');

  console.log('Wiping knowledge_documents table...');
  await db.delete(knowledgeDocuments);
  console.log('Table wiped.');

  let count = 0;

  for (const doc of policyDocuments) {
    console.log(`Embedding [${doc.domain}] ${doc.topic}...`);
    const embedding = await embedDocument(doc.content);

    await createKnowledgeDocument({
      domain: doc.domain,
      documentType: doc.documentType,
      topic: doc.topic,
      version: doc.version,
      effectiveDate: new Date(doc.effectiveDate),
      content: doc.content,
      embedding,
    });

    count++;
    console.log(`  ✓ Ingested: [${doc.domain}] ${doc.topic} (v${doc.version})`);
  }

  console.log(`\n--- Knowledge Ingestion: Complete (${count}/${policyDocuments.length} documents) ---`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Ingestion failed:', err);
  process.exit(1);
});
