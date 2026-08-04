import { fail, normalizePhone, ok } from '@dental/core';
import { verifyLicenseSignature } from '@dental/core/license-signature';
import { SUPERVISOR_PUBLIC_KEY_PEM } from '@dental/core/supervisor-public-key';
import { tenants } from '@dental/db-schema';
import { Hono } from 'hono';
import { z } from 'zod';
import type { Database } from '../db/client.ts';
import { env } from '../lib/env.ts';
import { writeLicense } from '../lib/license.ts';
import { activateLicense, markProvisioned, type ProvisioningBlock } from '../lib/license-client.ts';
import { logger } from '../lib/logger.ts';
import { rateLimit } from '../lib/rate-limit.ts';
import { provisionTenantInTx } from '../modules/auth/auth.service.ts';

/**
 * `POST /api/activate` — Local Desktop litsenziya faollashtirish (CLI-348
 * qaror 1). Auth YO'Q — litsenziya faollashtirilmagan bosqichda hali tenant
 * ham, foydalanuvchi ham yo'q; `license-middleware.ts`ning WHITELIST'i ham
 * shu yo'lni istisno qiladi. `activateLicense()` Supervisor'ga fingerprint
 * bilan so'rov yuboradi, muvaffaqiyatli bo'lsa `.lic` faylga yoziladi.
 *
 * Supervisor javobida ixtiyoriy **provisioning bloki** kelishi mumkin (vendor
 * klinika uchun oldindan yaratgan owner + filial ma'lumoti). U qo'llanishidan
 * oldin ikki bosqichli tekshiruvdan o'tadi: RSA imzo + shu aktivatsiyaga
 * bog'lanish (pastdagi izohlarga qarang).
 */
const activateSchema = z.object({ licenseKey: z.string().min(1) });

/**
 * Provisioning blokini lokal bazaga qo'llaydi (tenant + owner + filial + rol
 * shablonlari — `provisionTenantInTx` orqali, `registerTenant` bilan bitta yo'l).
 *
 * 🔴 IDEMPOTENT: lokal bazada tenant allaqachon bo'lsa (mijoz o'zi
 * `/register-tenant` orqali yaratgan yoki takroriy aktivatsiya) HECH NARSA
 * o'zgartirilmaydi va owner paroli QAYTA YOZILMAYDI. Aks holda litsenziya
 * kalitiga ega har kim aktivatsiyani qayta ishga tushirib owner hisobini
 * egallardi. Parol unutilsa — CLI-476 vendor-mediated reset oqimi.
 *
 * ⚠️ Guard ATAYIN "har qanday tenant bormi?" (`limit 1`) — "shu klinikaning
 * tenant'i bormi?" EMAS. Local Desktop deploy'i = BITTA klinika = bitta
 * tenant, va `clinicId` lokal bazada umuman saqlanmaydi. Uni
 * `where clinicId = ...` ga "tuzatish" parolni qayta yozish yo'lini qaytadan
 * ochib yuboradi.
 *
 * @returns `true` — provisioning qo'llandi; `false` — sokin o'tkazib yuborildi.
 */
const applyProvisioning = async (db: Database, p: ProvisioningBlock): Promise<boolean> => {
  const existing = await db.select({ id: tenants.id }).from(tenants).limit(1);
  if (existing.length > 0) {
    // ⚠️ Faqat `clinicId` loglanadi — parol (va telefon) HECH QACHON emas.
    logger.warn(
      { clinicId: p.clinicId, event: 'tenant.provisioning_skipped' },
      'tenant.provisioning_skipped — lokal bazada tenant mavjud, owner paroli qayta yozilmadi',
    );
    return false;
  }
  await db.transaction((tx) =>
    provisionTenantInTx(tx, {
      tenantName: p.tenantName,
      ownerPhone: p.ownerPhone,
      ownerFullName: p.ownerFullName,
      ownerPassword: p.ownerPassword,
      defaultLanguage: p.defaultLanguage === 'ru' ? 'ru' : 'uz',
      branchName: p.branchName,
      branchAddress: p.branchAddress || null,
      branchPhone: p.branchPhone || null,
      auditAction: 'tenant.provisioned',
    }),
  );
  return true;
};

export const activateRoutes = (deps: { db: Database }) => {
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

    let data: Awaited<ReturnType<typeof activateLicense>>;
    try {
      data = await activateLicense(parsed.data.licenseKey);
    } catch (err) {
      const code = err instanceof Error ? err.message : 'ACTIVATION_FAILED';
      // FINGERPRINT_UNAVAILABLE — mahalliy muhit muammosi (VM/konteyner);
      // qolgan barcha kodlar (INVALID_KEY, FINGERPRINT_MISMATCH,
      // SUPERVISOR_ERROR) — Supervisor rad etdi, mijoz xatosi.
      const status = code === 'FINGERPRINT_UNAVAILABLE' ? 500 : 403;
      return c.json(fail(code, "Litsenziyani faollashtirib bo'lmadi"), status);
    }

    const { provisioning, provisioningSignature, ...licensePayload } = data;

    let ownerPhone: string | undefined;
    if (provisioning) {
      // 1) IMZO — blokni haqiqatan vendor imzolaganmi (RSA, Supervisor'ning
      //    ochiq kaliti build'ga qotirilgan).
      if (
        !provisioningSignature ||
        !verifyLicenseSignature(provisioning, provisioningSignature, SUPERVISOR_PUBLIC_KEY_PEM)
      ) {
        return c.json(
          fail('PROVISIONING_SIGNATURE_INVALID', "Provisioning ma'lumoti ishonchsiz"),
          403,
        );
      }

      // 2) BOG'LASH — imzo O'ZI YETARLI EMAS: boshqa klinikaning HAQIQIY
      //    vendor-imzolangan bloki ham imzo tekshiruvidan o'tadi (Supervisor
      //    hozircha IP/HTTP orqali ishlaydi — MITM real tahdid), shuningdek
      //    eski blokni qayta uzatish (replay) mumkin.
      //
      //    🔴 `parsed.data.licenseKey` — foydalanuvchi KIRITGAN kalit. Bu —
      //    tekshiruvning YAGONA ishonchli langari: qolgan uchta taqqoslash
      //    `licensePayload`ga qarshi, uni esa hujumchi `provisioning` bilan
      //    BIRGA almashtira oladi. Shu sababli "takroriy" ko'rinsa ham HECH
      //    QACHON olib tashlanmaydi.
      if (
        provisioning.licenseKey !== parsed.data.licenseKey ||
        provisioning.licenseKey !== licensePayload.licenseKey ||
        provisioning.clinicId !== licensePayload.clinicId ||
        provisioning.issuedAt !== licensePayload.issuedAt
      ) {
        logger.warn(
          { clinicId: provisioning.clinicId, event: 'tenant.provisioning_mismatch' },
          "Provisioning bloki bu aktivatsiyaga bog'lanmagan — rad etildi",
        );
        return c.json(
          fail('PROVISIONING_MISMATCH', "Provisioning ma'lumoti bu litsenziyaga tegishli emas"),
          403,
        );
      }

      // Kanonik shakl — javobda ko'rsatilgan login `users.phone` bilan
      // bayt-ma-bayt bir xil bo'lsin (`provisionTenantInTx` ham normallashtiradi).
      ownerPhone = normalizePhone(provisioning.ownerPhone);

      try {
        // Natija (`true` — qo'llandi, `false` — idempotent skip) `.lic`
        // yozilishiga TA'SIR QILMAYDI: skip holatida ham litsenziya
        // yangilanishi bloklanmasligi kerak.
        await applyProvisioning(deps.db, provisioning);
      } catch (err) {
        // Bazaga yozish xatosi mijoz xatosi EMAS — uni yuqoridagi Supervisor
        // catch'iga qo'shib yuborish xato matnini javobdagi `code`ga
        // aylantirib ichki tafsilotni oshkor qilardi. `.lic` ATAYIN
        // yozilmaydi: mijoz qayta urinsa provisioning yana ishga tushadi.
        logger.error(
          {
            err: err instanceof Error ? err.message : String(err),
            clinicId: provisioning.clinicId,
          },
          'Provisioning qo‘llanmadi',
        );
        return c.json(fail('PROVISIONING_FAILED', "Klinika ma'lumotlarini yaratib bo'lmadi"), 500);
      }
    }

    // `.lic`ka AYNAN `LicenseData` maydonlari yoziladi. `isLicenseValid`
    // `{ signature, ...payload }` qiladi — Supervisor javobidagi har qanday
    // QO'SHIMCHA maydon (provisioning, serverTime, ...) faylga tushsa imzo
    // tekshiruvini BUZARDI. Shuning uchun butun javob emas, maydonlar aniq
    // tanlanadi.
    try {
      await writeLicense({
        licenseKey: licensePayload.licenseKey,
        clinicId: licensePayload.clinicId,
        modules: licensePayload.modules,
        expiresAt: licensePayload.expiresAt,
        gracePeriodDays: licensePayload.gracePeriodDays,
        issuedAt: licensePayload.issuedAt,
        fingerprint: licensePayload.fingerprint,
        signature: licensePayload.signature,
      });
    } catch (err) {
      logger.error(
        { err: err instanceof Error ? err.message : String(err) },
        "Litsenziya faylini yozib bo'lmadi",
      );
      return c.json(fail('LICENSE_WRITE_FAILED', "Litsenziya faylini yozib bo'lmadi"), 500);
    }

    // Best-effort — Supervisor vaqtinchalik owner parolini bazasidan o'chirsin.
    // `markProvisioned` hech qachon throw qilmaydi (license-client.ts).
    if (provisioning) await markProvisioned(parsed.data.licenseKey);

    return c.json(
      ok({ modules: licensePayload.modules, expiresAt: licensePayload.expiresAt, ownerPhone }),
    );
  });

  return app;
};
