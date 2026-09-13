import 'dotenv/config';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, pgPool } from './client.js';

async function main() {
  try {
    await migrate(db, { migrationsFolder: './drizzle/migrations' });
    console.log('Migrations applied successfully');
    await pgPool.end();
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

main();
