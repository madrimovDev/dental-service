import { fail, ok } from '@dental/core';
import { Hono } from 'hono';
import { z } from 'zod';
import { env } from '../lib/env.ts';
import { writeLicense } from '../lib/license.ts';
import { activateLicense } from '../lib/license-client.ts';
import { rateLimit } from '../lib/rate-limit.ts';

/**
 * `POST /api/activate` — Local Desktop litsenziya faollashtirish (CLI-348
 * qaror 1). Auth YO'Q — litsenziya faollashtirilmagan bosqichda hali tenant
 * ham, foydalanuvchi ham yo'q; `license-middleware.ts`ning WHITELIST'i ham
 * shu yo'lni istisno qiladi. `activateLicense()` Supervisor'ga fingerprint
 * bilan so'rov yuboradi, muvaffaqiyatli bo'lsa `.lic` faylga yoziladi.
 */
const activateSchema = z.object({ licenseKey: z.string().min(1) });

export const activateRoutes = () => {
  const app = new Hono();

  // ─── Rate limiting (CLI-370) — Redis fixed-window, IP-only ───────────────
  // licenseKey o'zi taxmin qilinayotgan sir (login'dagi telefon — hisob
  // identifikatori — dan farqli) — kalitga kiritilmaydi, aks holda har
  // urinishda boshqa key sinalsa yangi bucket ochilib limit chetlab o'tiladi.
  const activateRateLimit = rateLimit({
    name: 'activate',
    limit: env.ACTIVATE_RATE_LIMIT,
    windowSeconds: env.ACTIVATE_RATE_LIMIT_WINDOW_SEC,
  });

  app.post('/', activateRateLimit, async (c) => {
    const json = await c.req.json().catch(() => null);
    const parsed = activateSchema.safeParse(json);
    if (!parsed.success) {
      return c.json(fail('INVALID_REQUEST', 'licenseKey majburiy'), 400);
    }

    try {
      const data = await activateLicense(parsed.data.licenseKey);
      await writeLicense(data);
      return c.json(ok({ modules: data.modules, expiresAt: data.expiresAt }));
    } catch (err) {
      const code = err instanceof Error ? err.message : 'ACTIVATION_FAILED';
      // FINGERPRINT_UNAVAILABLE — mahalliy muhit muammosi (VM/konteyner);
      // qolgan barcha kodlar (INVALID_KEY, FINGERPRINT_MISMATCH,
      // SUPERVISOR_ERROR) — Supervisor rad etdi, mijoz xatosi.
      const status = code === 'FINGERPRINT_UNAVAILABLE' ? 500 : 403;
      return c.json(fail(code, "Litsenziyani faollashtirib bo'lmadi"), status);
    }
  });

  return app;
};
