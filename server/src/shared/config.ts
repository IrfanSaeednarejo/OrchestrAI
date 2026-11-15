import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_PORT: z.coerce.number().default(4000),
  POSTGRES_USER: z.string(),
  POSTGRES_PASSWORD: z.string(),
  POSTGRES_DB: z.string(),
  POSTGRES_PORT: z.coerce.number(),
  POSTGRES_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number(),
  REDIS_HOST: z.string().default('localhost'),
  GEMINI_API_KEY: z.string(),
  LANGCHAIN_TRACING_V2: z.enum(['true', 'false']).default('false'),
  LANGCHAIN_API_KEY: z.string().optional(),
  LANGCHAIN_PROJECT: z.string().default('orchestrai'),
  LANGCHAIN_ENDPOINT: z.string().default('https://api.smith.langchain.com'),
  CLIENT_ORIGIN: z.string().url().default('http://localhost:3000'),
  ENABLE_DEMO_ENDPOINTS: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  // Phase 21: HMAC-SHA256 secret for signing Bearer session tokens.
  // Must be at least 32 characters. Falls back to a dev-only default; production MUST set this.
  TOKEN_SECRET: z.string().min(32).default('orchestrai-dev-token-secret-change-in-prod!!'),
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

// Hard-off in production regardless of environment variable setting (Amendment A2)
const enableDemoEndpoints =
  envVars.NODE_ENV === 'production' ? false : envVars.ENABLE_DEMO_ENDPOINTS;

if (enableDemoEndpoints) {
  console.warn(
    '⚠️ [SECURITY WARNING] ENABLE_DEMO_ENDPOINTS is enabled. Demo identity and OTP inspection routes are active.'
  );
}

export const config = Object.freeze({
  env: envVars.NODE_ENV,
  app: {
    port: envVars.APP_PORT,
    clientOrigin: envVars.CLIENT_ORIGIN,
    enableDemoEndpoints,
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
  gemini: {
    apiKey: envVars.GEMINI_API_KEY,
  },
  langsmith: {
    tracingEnabled: envVars.LANGCHAIN_TRACING_V2 === 'true' && Boolean(envVars.LANGCHAIN_API_KEY),
    apiKey: envVars.LANGCHAIN_API_KEY ?? null,
    project: envVars.LANGCHAIN_PROJECT,
    endpoint: envVars.LANGCHAIN_ENDPOINT,
  },
  auth: {
    // Phase 21: HMAC-SHA256 secret for session token signing.
    tokenSecret: envVars.TOKEN_SECRET,
    // Token expiry: 7 days in milliseconds.
    tokenExpiryMs: 7 * 24 * 60 * 60 * 1000,
  },
});

export type AppConfig = typeof config;
