import fs from 'node:fs/promises';
import path from 'node:path';

async function main() {
  const content = await fs.readFile('src/evaluation/dataset/scenarios-v2.ts', 'utf-8');
  const matches = content.match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g) || [];
  const unique = Array.from(new Set(matches)).sort();
  console.log('Unique UUIDs in scenarios-v2.ts:');
  console.log(unique);
}

main().catch(console.error);

