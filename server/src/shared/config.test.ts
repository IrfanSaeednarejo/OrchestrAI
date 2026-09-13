import { describe, it, expect } from 'vitest';
import { config } from './config.js';

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
});
