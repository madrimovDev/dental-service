import { ok } from '@dental/core';
import { Hono } from 'hono';
import type { Database } from '../../db/client.ts';
import { createHealthService } from './health.service.ts';

export const healthRoutes = (deps: { db: Database }) => {
  const app = new Hono();
  const service = createHealthService(deps);

  app.get('/', async (c) => {
    const dbStatus = await service.checkDb();
    // FX-145 (LC-23) — desktop serverining barqaror identifikatori (desktop
    // process-manager `DENTAL_SERVER_ID` beradi). Klient TOFU'da manzil bilan
    // birga pinlaydi. Maxfiy emas; bulutda qaytarilmaydi. Har so'rovda o'qiladi
    // (license-middleware `DENTAL_LOCAL_DESKTOP` pretsedenti).
    const serverId =
      process.env.DENTAL_LOCAL_DESKTOP === 'true' ? process.env.DENTAL_SERVER_ID : undefined;
    return c.json(
      ok({
        ok: true as const,
        db: dbStatus,
        ts: new Date().toISOString(),
        ...(serverId ? { serverId } : {}),
      }),
    );
  });

  return app;
};
