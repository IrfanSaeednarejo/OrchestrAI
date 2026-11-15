import { z } from 'zod';

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    APP_PORT: z.coerce.number().default(4000),
    DATABASE_URL: z.string().optional(),
    DATABASE_URL_UNPOOLED: z.string().optional(),
    POSTGRES_USER: z.string().optional(),
    POSTGRES_PASSWORD: z.string().optional(),
    POSTGRES_DB: z.string().optional(),
    POSTGRES_PORT: z.coerce.number().optional(),
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
    RESEND_API_KEY: z.string().min(1).default('re_placeholder_for_tests'),
    EMAIL_FROM: z.string().default('OrchestrAI Support <onboarding@resend.dev>'),
    EMAIL_DRY_RUN: z.enum(['true', 'false']).optional(),
  })
  .transform((data) => ({
    ...data,
    EMAIL_DRY_RUN:
      data.EMAIL_DRY_RUN !== undefined
        ? data.EMAIL_DRY_RUN === 'true'
        : data.NODE_ENV === 'test',
  }));

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

let pgUser = envVars.POSTGRES_USER ?? '';
let pgPassword = envVars.POSTGRES_PASSWORD ?? '';
let pgDatabase = envVars.POSTGRES_DB ?? '';
let pgHost = envVars.POSTGRES_HOST ?? 'localhost';
let pgPort = envVars.POSTGRES_PORT ?? 5432;
let connectionString = envVars.DATABASE_URL ?? '';

if (envVars.DATABASE_URL) {
  try {
    const url = new URL(envVars.DATABASE_URL);
    pgUser = url.username || pgUser;
    pgPassword = url.password || pgPassword;
    pgDatabase = url.pathname.replace(/^\//, '') || pgDatabase;
    pgHost = url.hostname || pgHost;
    pgPort = url.port ? Number(url.port) : 5432;
  } catch {
    // fallback to explicit values
  }
} else {
  connectionString = `postgresql://${pgUser}:${pgPassword}@${pgHost}:${pgPort}/${pgDatabase}`;
}

export const config = Object.freeze({
  env: envVars.NODE_ENV,
  app: {
    port: envVars.APP_PORT,
    clientOrigin: envVars.CLIENT_ORIGIN,
    enableDemoEndpoints,
  },
  postgres: {
    user: pgUser,
    password: pgPassword,
    database: pgDatabase,
    host: pgHost,
    port: pgPort,
    connectionString,
    unpooledConnectionString: envVars.DATABASE_URL_UNPOOLED || connectionString,
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
  email: {
    apiKey: envVars.RESEND_API_KEY,
    from: envVars.EMAIL_FROM,
    dryRun: envVars.EMAIL_DRY_RUN,
  },
});

export type AppConfig = typeof config;
