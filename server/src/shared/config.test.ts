import { describe, it, expect } from 'vitest';
import { config, envSchema } from './config.js';

describe('Config Loader', () => {
  it('should load a valid environment', () => {
    expect(['development', 'test', 'production']).toContain(config.env);
  });

  it('should have a valid postgres port greater than 0', () => {
    expect(config.postgres.port).toBeGreaterThan(0);
  });

  it('should have a valid redis port greater than 0', () => {
    expect(config.redis.port).toBeGreaterThan(0);
  });

  it('should expose config.app.clientOrigin as a valid URL string', () => {
    expect(typeof config.app.clientOrigin).toBe('string');
    expect(() => new URL(config.app.clientOrigin)).not.toThrow();
  });

  it('envSchema defaults CLIENT_ORIGIN to http://localhost:3000', () => {
    const parsed = envSchema.safeParse({
      POSTGRES_USER: 'test_user',
      POSTGRES_PASSWORD: 'test_password',
      POSTGRES_DB: 'test_db',
      POSTGRES_PORT: 5432,
      REDIS_PORT: 6379,
      GEMINI_API_KEY: 'test-key',
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.CLIENT_ORIGIN).toBe('http://localhost:3000');
    }
  });

  it('envSchema accepts a custom CLIENT_ORIGIN', () => {
    const parsed = envSchema.safeParse({
      POSTGRES_USER: 'test_user',
      POSTGRES_PASSWORD: 'test_password',
      POSTGRES_DB: 'test_db',
      POSTGRES_PORT: 5432,
      REDIS_PORT: 6379,
      GEMINI_API_KEY: 'test-key',
      CLIENT_ORIGIN: 'https://app.example.com',
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.CLIENT_ORIGIN).toBe('https://app.example.com');
    }
  });

  it('envSchema rejects an invalid CLIENT_ORIGIN (not a URL)', () => {
    const parsed = envSchema.safeParse({
      POSTGRES_USER: 'test_user',
      POSTGRES_PASSWORD: 'test_password',
      POSTGRES_DB: 'test_db',
      POSTGRES_PORT: 5432,
      REDIS_PORT: 6379,
      GEMINI_API_KEY: 'test-key',
      CLIENT_ORIGIN: 'not-a-url',
    });

    expect(parsed.success).toBe(false);
  });

  describe('Demo Endpoints Config (Phase 17 Amendment A2)', () => {
    it('envSchema defaults ENABLE_DEMO_ENDPOINTS to false', () => {
      const parsed = envSchema.safeParse({
        POSTGRES_USER: 'test_user',
        POSTGRES_PASSWORD: 'test_password',
        POSTGRES_DB: 'test_db',
        POSTGRES_PORT: 5432,
        REDIS_PORT: 6379,
        GEMINI_API_KEY: 'test-key',
      });

      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.ENABLE_DEMO_ENDPOINTS).toBe(false);
      }
    });

    it('envSchema accepts "true" and transforms to true boolean', () => {
      const parsed = envSchema.safeParse({
        POSTGRES_USER: 'test_user',
        POSTGRES_PASSWORD: 'test_password',
        POSTGRES_DB: 'test_db',
        POSTGRES_PORT: 5432,
        REDIS_PORT: 6379,
        GEMINI_API_KEY: 'test-key',
        ENABLE_DEMO_ENDPOINTS: 'true',
      });

      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.ENABLE_DEMO_ENDPOINTS).toBe(true);
      }
    });

    it('envSchema rejects non-enum values like "1" or "yes"', () => {
      const parsed = envSchema.safeParse({
        POSTGRES_USER: 'test_user',
        POSTGRES_PASSWORD: 'test_password',
        POSTGRES_DB: 'test_db',
        POSTGRES_PORT: 5432,
        REDIS_PORT: 6379,
        GEMINI_API_KEY: 'test-key',
        ENABLE_DEMO_ENDPOINTS: 'yes',
      });

      expect(parsed.success).toBe(false);
    });

    it('exposes config.app.enableDemoEndpoints as a boolean', () => {
      expect(typeof config.app.enableDemoEndpoints).toBe('boolean');
    });
  });

  describe('LangSmith Observability Config (Phase 14 OD-14)', () => {
    it('should have safe defaults when LangSmith environment variables are omitted', () => {
      expect(config.langsmith).toBeDefined();
      expect(config.langsmith.project).toBe('orchestrai');
      expect(config.langsmith.endpoint).toBe('https://api.smith.langchain.com');
      // Tracing disabled if no API key is supplied
      if (!process.env['LANGCHAIN_API_KEY']) {
        expect(config.langsmith.tracingEnabled).toBe(false);
      }
    });

    it('envSchema defaults LANGCHAIN_TRACING_V2 to false and provides standard defaults', () => {
      const parsed = envSchema.safeParse({
        POSTGRES_USER: 'test_user',
        POSTGRES_PASSWORD: 'test_password',
        POSTGRES_DB: 'test_db',
        POSTGRES_PORT: 5432,
        REDIS_PORT: 6379,
        GEMINI_API_KEY: 'test-key',
      });

      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.LANGCHAIN_TRACING_V2).toBe('false');
        expect(parsed.data.LANGCHAIN_PROJECT).toBe('orchestrai');
        expect(parsed.data.LANGCHAIN_ENDPOINT).toBe('https://api.smith.langchain.com');
        expect(parsed.data.LANGCHAIN_API_KEY).toBeUndefined();
      }
    });

    it('envSchema accepts explicit LangSmith configuration', () => {
      const parsed = envSchema.safeParse({
        POSTGRES_USER: 'test_user',
        POSTGRES_PASSWORD: 'test_password',
        POSTGRES_DB: 'test_db',
        POSTGRES_PORT: 5432,
        REDIS_PORT: 6379,
        GEMINI_API_KEY: 'test-key',
        LANGCHAIN_TRACING_V2: 'true',
        LANGCHAIN_API_KEY: 'ls__mock_api_key_123',
        LANGCHAIN_PROJECT: 'orchestrai-production',
        LANGCHAIN_ENDPOINT: 'https://custom.smith.endpoint.com',
      });

      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.LANGCHAIN_TRACING_V2).toBe('true');
        expect(parsed.data.LANGCHAIN_API_KEY).toBe('ls__mock_api_key_123');
        expect(parsed.data.LANGCHAIN_PROJECT).toBe('orchestrai-production');
        expect(parsed.data.LANGCHAIN_ENDPOINT).toBe('https://custom.smith.endpoint.com');
      }
    });
  });
});
