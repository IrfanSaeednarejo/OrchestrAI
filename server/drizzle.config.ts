import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

const user = process.env.POSTGRES_USER;
const password = process.env.POSTGRES_PASSWORD;
const host = process.env.POSTGRES_HOST || 'localhost';
const port = process.env.POSTGRES_PORT;
const db = process.env.POSTGRES_DB;

const connectionString = `postgresql://${user}:${password}@${host}:${port}/${db}`;

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/persistence/db/schema.ts',
  out: './drizzle/migrations',
  dbCredentials: {
    url: connectionString,
  },
});
