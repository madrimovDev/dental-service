import { describe, expect, test } from 'bun:test';
import { bootstrapStatusRoutes } from './bootstrap-status.ts';

const fakeDb = (hasTenant: boolean) =>
  ({
    select: () => ({
      from: () => ({
        limit: async () => (hasTenant ? [{ id: 'tenant-1' }] : []),
      }),
    }),
  }) as never;

describe('GET /api/bootstrap-status', () => {
  test('tenant bor + litsenziya bor', async () => {
    const app = bootstrapStatusRoutes({
      db: fakeDb(true),
      readLicense: async () => ({ licenseKey: 'X' }) as never,
    });
    const res = await app.request('/');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      data: { hasLicense: true, hasTenant: true },
    });
  });

  test("litsenziya bor, tenant YO'Q — qulflanish holati", async () => {
    const app = bootstrapStatusRoutes({
      db: fakeDb(false),
      readLicense: async () => ({ licenseKey: 'X' }) as never,
    });
    const res = await app.request('/');

    expect(await res.json()).toEqual({
      success: true,
      data: { hasLicense: true, hasTenant: false },
    });
  });

  test("litsenziya yo'q", async () => {
    const app = bootstrapStatusRoutes({
      db: fakeDb(false),
      readLicense: async () => null,
    });
    const res = await app.request('/');

    expect(await res.json()).toEqual({
      success: true,
      data: { hasLicense: false, hasTenant: false },
    });
  });

  test('DB xatosi 500 beradi (gate bloklamaydi — web fallback qiladi)', async () => {
    const app = bootstrapStatusRoutes({
      db: {
        select: () => ({
          from: () => ({
            limit: async () => {
              throw new Error('connection refused');
            },
          }),
        }),
      } as never,
      readLicense: async () => null,
    });
    const res = await app.request('/');

    expect(res.status).toBe(500);
  });
});
