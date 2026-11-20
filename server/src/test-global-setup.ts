import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function setup() {
  config({ path: resolve(__dirname, '../.env') });
  if (process.env.TEST_DATABASE_URL) {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    if (process.env.TEST_DATABASE_URL_UNPOOLED) {
      process.env.DATABASE_URL_UNPOOLED = process.env.TEST_DATABASE_URL_UNPOOLED;
    }
    console.log('[test-global-setup] Using TEST_DATABASE_URL (isolated test DB)');
  } else {
    console.log('[test-global-setup] TEST_DATABASE_URL not set — using DATABASE_URL (CAUTION: likely prod)');
  }
}
