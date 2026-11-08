import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

const user = process.env.POSTGRES_USER;
const password = process.env.POSTGRES_PASSWORD;
const host = process.env.POSTGRES_HOST || 'localhost';
const port = process.env.POSTGRES_PORT;
const db = process.env.POSTGRES_DB;

const fallbackConnectionString = user && password && port && db
  ? `postgresql://${user}:${password}@${host}:${port}/${db}`
  : '';

const connectionString =
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.DATABASE_URL ||
  fallbackConnectionString;

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/persistence/db/schema.ts',
  out: './drizzle/migrations',
  dbCredentials: {
    url: connectionString,
  },
});
