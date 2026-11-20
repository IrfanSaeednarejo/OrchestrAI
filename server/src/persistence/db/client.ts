import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { config } from '../../shared/config.js';
import * as schema from './schema.js';

export const pgPool = new Pool({
  connectionString: config.postgres.connectionString,
});

export function poolStats() {
  const p = (db as unknown as { $client?: { pool?: Pool }; pool?: Pool }).$client?.pool ?? (db as unknown as { pool?: Pool }).pool ?? pgPool;
  return { total: p?.totalCount, idle: p?.idleCount, waiting: p?.waitingCount };
}

export const db = drizzle(pgPool, { schema });
