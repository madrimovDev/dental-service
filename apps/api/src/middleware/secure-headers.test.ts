import { describe, expect, test } from 'bun:test';
import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';

/**
 * Mirrors the secureHeaders configuration applied in app.ts. Asserted on a
 * minimal app so the test runs under bare `bun test` (no env boot dependency).
 */
function buildApp(nodeEnv: 'development' | 'production') {
  const app = new Hono();
  app.use(
    '*',
    secureHeaders({
      contentSecurityPolicy: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
      xFrameOptions: 'DENY',
      xContentTypeOptions: 'nosniff',
      strictTransportSecurity:
        nodeEnv === 'production' ? 'max-age=31536000; includeSubDomains; preload' : false,
    }),
  );
  app.get('/ping', (c) => c.json({ ok: true }));
  return app;
}

describe('security headers middleware', () => {
  test('emits core security headers', async () => {
    const res = await buildApp('development').request('/ping');
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(res.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
  });

  test('omits HSTS in development', async () => {
    const res = await buildApp('development').request('/ping');
    expect(res.headers.get('strict-transport-security')).toBeNull();
  });

  test('sets HSTS in production', async () => {
    const res = await buildApp('production').request('/ping');
    expect(res.headers.get('strict-transport-security')).toContain('max-age=31536000');
  });

  test('does not break a normal request', async () => {
    const res = await buildApp('development').request('/ping');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
