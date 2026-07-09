import { describe, expect, test } from 'bun:test';
import { closeRedisPub } from './tenant-settings.service.ts';

/**
 * CLI-475 B5 — `redisPub` (telegram:reload publish uchun lazy singleton) shutdown'da
 * yopilmasdan osilib qolardi. `closeRedisPub` shutdown-hook util (rate-limit.ts
 * `closeRateLimitRedis` bilan bir xil pattern) — ulanish ochilmagan holatda ham
 * xavfsiz (idempotent), shutdown ikki signal (SIGTERM+SIGINT) olsa ham throw
 * qilmasligi kerak.
 */
describe('closeRedisPub (CLI-475 B5)', () => {
  test('ochilmagan pub bilan idempotent — throw qilmaydi, bir necha marta xavfsiz', async () => {
    await expect(closeRedisPub()).resolves.toBeUndefined();
    await expect(closeRedisPub()).resolves.toBeUndefined();
  });
});
