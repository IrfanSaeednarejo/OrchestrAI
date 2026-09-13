import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_PORT: z.coerce.number().default(4000),
  POSTGRES_USER: z.string(),
  POSTGRES_PASSWORD: z.string(),
  POSTGRES_DB: z.string(),
  POSTGRES_PORT: z.coerce.number(),
  POSTGRES_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number(),
  REDIS_HOST: z.string().default('localhost'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

const envVars = parsed.data;

export const config = Object.freeze({
  env: envVars.NODE_ENV,
  app: {
    port: envVars.APP_PORT,
  },
  postgres: {
    user: envVars.POSTGRES_USER,
    password: envVars.POSTGRES_PASSWORD,
    database: envVars.POSTGRES_DB,
    host: envVars.POSTGRES_HOST,
    port: envVars.POSTGRES_PORT,
    connectionString: `postgresql://${envVars.POSTGRES_USER}:${envVars.POSTGRES_PASSWORD}@${envVars.POSTGRES_HOST}:${envVars.POSTGRES_PORT}/${envVars.POSTGRES_DB}`,
  },
  redis: {
    host: envVars.REDIS_HOST,
    port: envVars.REDIS_PORT,
    url: `redis://${envVars.REDIS_HOST}:${envVars.REDIS_PORT}`,
  },
});

export type AppConfig = typeof config;
