import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, pgPool } from './client.js';

async function main() {
  try {
    // Ensure pgvector extension exists before applying migrations that reference vector(768)
    await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector;`);
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
