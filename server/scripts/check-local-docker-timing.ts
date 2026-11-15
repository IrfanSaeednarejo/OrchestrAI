import fs from 'node:fs/promises';
import path from 'node:path';

async function main() {
  const files = [
    'local-docker-run1.json',
    'local-docker-run2.json',
    'local-docker-run3.json',
  ];

  for (const f of files) {
    const p = path.resolve('../benchmarks/results', f);
    const content = JSON.parse(await fs.readFile(p, 'utf-8'));
    console.log(`=== ${f} ===`);
    console.log('Overall:', content.timingSummary?.overall);
    console.log('Turn 1:', content.timingSummary?.turn1);
    console.log('Later Turns:', content.timingSummary?.laterTurns);
  }
}

main().catch(console.error);

