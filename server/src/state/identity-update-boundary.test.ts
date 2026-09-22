import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildIdentityUpdate } from './identity-update.js'; // to be found by scan

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function walkDir(dir: string, fileList: string[] = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const stat = fs.statSync(path.join(dir, file));
    if (stat.isDirectory()) {
      walkDir(path.join(dir, file), fileList);
    } else {
      fileList.push(path.join(dir, file));
    }
  }
  return fileList;
}

describe('Identity update boundary', () => {
  it('prevents importing identity-update outside of allowed files', () => {
    const srcDir = path.resolve(__dirname, '..');
    const allFiles = walkDir(srcDir).filter(f => f.endsWith('.ts'));

    let foundLegitimateImporters = 0;

    for (const file of allFiles) {
      const content = fs.readFileSync(file, 'utf8');
      
      const isImporting = /from\s+['"].*identity-update(\.js)?['"]/.test(content) || 
                          /import\s+.*['"].*identity-update(\.js)?['"]/.test(content);
                          
      if (isImporting) {
        const relativePath = path.relative(path.resolve(__dirname, '../..'), file).replace(/\\/g, '/');
        
        const isAllowed = relativePath === 'src/state/identity-update.ts' ||
                          relativePath === 'src/state/identity-update.test.ts' ||
                          relativePath === 'src/state/identity-update-boundary.test.ts' ||
                          relativePath.startsWith('src/agents/specialists/account-access/');
                          
        if (!isAllowed) {
          expect.fail(`Illegal import of identity-update found in: ${relativePath}`);
        }
        
        foundLegitimateImporters++;
      }
    }

    expect(foundLegitimateImporters).toBeGreaterThanOrEqual(2);
  });
});
