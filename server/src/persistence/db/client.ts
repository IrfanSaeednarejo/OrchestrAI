import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { config } from '../../shared/config.js';
import * as schema from './schema.js';

export const pgPool = new Pool({
  connectionString: config.postgres.connectionString,
});

export const db = drizzle(pgPool, { schema });
