import { describe, expect, test } from 'bun:test';
import { isPlaceholderSecret, parseEnv } from './env-schema.ts';

const STRONG_SECRET = 'k7Xq2pZ9vL4mR8nT1wYc6bH3jF5sG0dQaE';
const PLACEHOLDER = 'change_me_in_production_min_32_chars_long_xxx';

const baseRaw = {
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  MINIO_ENDPOINT: 'http://localhost:9000',
  MINIO_BUCKET: 'dental-uploads',
  MINIO_ROOT_USER: 'dental',
  MINIO_ROOT_PASSWORD: 'dental_local_dev',
  WEB_ORIGIN: 'http://localhost:8000',
};

describe('isPlaceholderSecret', () => {
  test('detects the .env.example literal', () => {
    expect(isPlaceholderSecret(PLACEHOLDER)).toBe(true);
  });

  test('detects change_me / change-me markers (case-insensitive)', () => {
    expect(isPlaceholderSecret('CHANGE_ME_super_long_secret_value_here')).toBe(true);
    expect(isPlaceholderSecret('please-change-me-before-prod-deploy-xx')).toBe(true);
  });

  test('accepts a strong unique secret', () => {
    expect(isPlaceholderSecret(STRONG_SECRET)).toBe(false);
  });
});

describe('parseEnv JWT_SECRET guard', () => {
  test('rejects placeholder JWT_SECRET in production', () => {
    const result = parseEnv({ ...baseRaw, NODE_ENV: 'production', JWT_SECRET: PLACEHOLDER });
    expect(result.success).toBe(false);
    if (!result.success) {
      const onJwt = result.error.issues.some((i) => i.path.includes('JWT_SECRET'));
      expect(onJwt).toBe(true);
    }
  });

  test('accepts a strong JWT_SECRET in production', () => {
    const result = parseEnv({ ...baseRaw, NODE_ENV: 'production', JWT_SECRET: STRONG_SECRET });
    expect(result.success).toBe(true);
  });

  test('allows placeholder JWT_SECRET in development (local dev unblocked)', () => {
    const result = parseEnv({ ...baseRaw, NODE_ENV: 'development', JWT_SECRET: PLACEHOLDER });
    expect(result.success).toBe(true);
  });

  test('allows placeholder JWT_SECRET in test (bun test --env-file unblocked)', () => {
    const result = parseEnv({ ...baseRaw, NODE_ENV: 'test', JWT_SECRET: PLACEHOLDER });
    expect(result.success).toBe(true);
  });

  test('still enforces min(32) length', () => {
    const result = parseEnv({ ...baseRaw, NODE_ENV: 'development', JWT_SECRET: 'tooshort' });
    expect(result.success).toBe(false);
  });
});

describe('MINIO_* is optional (dead since storage.ts local-filesystem, CLI-340)', () => {
  test('boots without any MINIO_* vars set', () => {
    const { MINIO_ENDPOINT, MINIO_BUCKET, MINIO_ROOT_USER, MINIO_ROOT_PASSWORD, ...rest } = baseRaw;
    const result = parseEnv({ ...rest, NODE_ENV: 'development', JWT_SECRET: STRONG_SECRET });
    expect(result.success).toBe(true);
  });
});
