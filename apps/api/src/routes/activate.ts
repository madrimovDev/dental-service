import { fail, normalizePhone, ok } from '@dental/core';
import { verifyLicenseSignature } from '@dental/core/license-signature';
import { SUPERVISOR_PUBLIC_KEY_PEM } from '@dental/core/supervisor-public-key';
import { tenants, users } from '@dental/db-schema';
import { eq } from 'drizzle-orm';
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
 * @returns `applied` — provisioning qo'llandimi (`false` = sokin o'tkazib
 * yuborildi); `ownerPhone` — foydalanuvchiga ko'rsatiladigan login telefoni
 * kanonik shaklda (`users.phone` bilan bayt-ma-bayt bir xil).
 *
 * 🔴 Skip holatida ham telefon qaytariladi, lekin MAVJUD owner'niki — vendor
 * blokidagi telefonni ko'rsatish mijozni lokal bazada MAVJUD BO'LMAGAN hisobga
 * yo'llardi (u o'zi `/register-tenant` orqali boshqa raqam bilan ro'yxatdan
 * o'tgan bo'lishi mumkin). Yangi ma'lumot oshkor qilinmaydi: bu allaqachon shu
 * mashinaning egasi.
 */
const applyProvisioning = async (
  db: Database,
  p: ProvisioningBlock,
): Promise<{ applied: boolean; ownerPhone: string | null }> => {
  const [existing] = await db
    .select({ id: tenants.id, ownerUserId: tenants.ownerUserId })
    .from(tenants)
    .limit(1);
  if (existing) {
    // ⚠️ Faqat `clinicId` loglanadi — parol (va telefon) HECH QACHON emas.
    logger.warn(
      { clinicId: p.clinicId, event: 'tenant.provisioning_skipped' },
      'tenant.provisioning_skipped — lokal bazada tenant mavjud, owner paroli qayta yozilmadi',
    );
    // `users`da RLS yo'q (platform-darajali jadval, `tenant_id` ustuni yo'q) —
    // pre-auth kontekstda ham o'qiladi.
    const [owner] = await db
      .select({ phone: users.phone })
      .from(users)
      .where(eq(users.id, existing.ownerUserId));
    return { applied: false, ownerPhone: owner?.phone ?? null };
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
  return { applied: true, ownerPhone: normalizePhone(p.ownerPhone) };
};

export const activateRoutes = (deps: {
  db: Database;
  /**
   * Provisioning imzosini tekshiruvchi ochiq kalit. Default — build'ga
   * qotirilgan production kaliti; PROD'da hech qachon berilmaydi.
   *
   * Test seam: `mock.module('@dental/core/supervisor-public-key')` bu yerda
   * ISHONCHSIZ — `bun test` butun katalogni bitta jarayonda ishga tushiradi
   * va bu modul `activate.ts` birinchi import qilinganda "muzlab" qoladi
   * (qaysi test fayli birinchi yuklagan bo'lsa, o'shaning holati). Kalitni
   * parametr sifatida berish testni fayl tartibidan mustaqil qiladi.
   */
  supervisorPublicKeyPem?: string;
  /**
   * Supervisor klienti va `.lic` yozuvchisi — PROD'da hech qachon berilmaydi
   * (default = haqiqiy implementatsiya). `reset-owner-password.ts`ning
   * `deps.verifyReset ?? defaultVerifyReset` pretsedenti.
   *
   * Nega parametr, `mock.module` emas: `bun test` butun katalogni BITTA
   * jarayonda ishga tushiradi va `mock.module` RESOLVED PATH bo'yicha GLOBAL —
   * `cli-370-activate-rate-limit.test.ts` `license-client.ts`ni butun jarayon
   * uchun almashtiradi, ya'ni boshqa test faylining Supervisor mock'i JIM
   * chetlab o'tiladi (isbot: to'liq `tests/integration/` yugurishida
   * provisioning testlari yiqilardi). Parametr bilan har test o'z klientini
   * beradi va fayl tartibiga bog'liq bo'lmaydi.
   */
  activate?: typeof activateLicense;
  markProvisioned?: typeof markProvisioned;
  writeLicense?: typeof writeLicense;
}) => {
  const publicKeyPem = deps.supervisorPublicKeyPem ?? SUPERVISOR_PUBLIC_KEY_PEM;
  const requestActivation = deps.activate ?? activateLicense;
  const confirmProvisioned = deps.markProvisioned ?? markProvisioned;
  const persistLicense = deps.writeLicense ?? writeLicense;
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
      data = await requestActivation(parsed.data.licenseKey);
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
        !verifyLicenseSignature(provisioning, provisioningSignature, publicKeyPem)
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

      try {
        // `applied` (`true` — qo'llandi, `false` — idempotent skip) `.lic`
        // yozilishiga TA'SIR QILMAYDI: skip holatida ham litsenziya
        // yangilanishi bloklanmasligi kerak.
        //
        // 🔴 `ownerPhone` ikkala holatda ham qaytariladi, lekin MANBASI
        // boshqa: qo'llanganda — vendor bloki, skip'da — lokal bazadagi
        // MAVJUD owner (`applyProvisioning` izohiga qarang). Shu sababli bu
        // yerda `provisioning.ownerPhone` QAYTA O'QILMAYDI — aks holda skip
        // holatida mijozga mavjud bo'lmagan hisobning telefoni "login" deb
        // ko'rsatilardi (M1).
        //
        // ⚠️ Qaytish qiymati obyekt — uni to'g'ridan-to'g'ri `if (await ...)`
        // shartiga qo'yish HAR DOIM truthy bo'ladi va typecheck buni
        // ushlamaydi. Doim `.applied`/`.ownerPhone` bo'yicha o'qing.
        const result = await applyProvisioning(deps.db, provisioning);
        // Kanonik shakl — ko'rsatilgan login `users.phone` bilan bayt-ma-bayt
        // bir xil (`provisionTenantInTx` ham normallashtiradi, skip yo'lida esa
        // qiymat bevosita `users.phone`dan olinadi).
        ownerPhone = result.ownerPhone ?? undefined;
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
      await persistLicense({
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
    if (provisioning) await confirmProvisioned(parsed.data.licenseKey);

    return c.json(
      ok({ modules: licensePayload.modules, expiresAt: licensePayload.expiresAt, ownerPhone }),
    );
  });

  return app;
};
