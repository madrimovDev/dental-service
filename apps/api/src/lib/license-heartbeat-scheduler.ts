import {
  invalidateLicense,
  isLicenseAuthenticForThisMachine,
  isRevocationAuthenticForThisMachine,
  type LicenseData,
  readAnchor,
  readLicense,
  writeAnchor,
  writeLicense,
} from './license.ts';
import { sendHeartbeat } from './license-client.ts';
import { logger } from './logger.ts';

// `Pick<typeof logger, ...>` instead of a hand-written interface — the real
// pino `logger` types its `info`/`warn`/`error` first param as `object`
// (LogFn overloads), not `unknown`; a hand-written `(obj: unknown) => void`
// signature would NOT be assignable from it (contravariant param under
// strictFunctionTypes) and would fail typecheck when the real logger is
// passed in `startLicenseHeartbeatScheduler`'s default `runCheck`. `Pick`
// guarantees the real logger satisfies it, and the test's plain
// `{ info: mock(() => {}), ... }` fakes still satisfy it too (a `() => void`
// is assignable to any of pino's overloaded `LogFn` signatures).
export type HeartbeatLogger = Pick<typeof logger, 'info' | 'warn' | 'error'>;

export interface RunHeartbeatCheckDeps {
  readLicense: () => Promise<LicenseData | null>;
  writeLicense: (data: LicenseData) => Promise<void>;
  invalidateLicense: () => Promise<void>;
  sendHeartbeat: (licenseKey: string) => Promise<LicenseData>;
  // CLI-437 + FX-87 — monotonik langar har muvaffaqiyatli heartbeat'da
  // server vaqti (`issuedAt`) bilan qayta o'rnatiladi (mahalliy soatdan ustun;
  // yangi javobda pasaytirilishi ham mumkin — `runLicenseHeartbeatCheck`).
  readAnchor: () => Promise<number>;
  writeAnchor: (ms: number) => Promise<void>;
  // FX-06 (LA-15, X-4) — javob `.lic`ga yozilishidan oldin imzo + mahalliy
  // fingerprint tekshiruvi. Ixtiyoriy, lekin STANDART qiymati haqiqiy tekshiruv
  // (`isLicenseAuthenticForThisMachine`) — chaqiruvchi uni unutsa ham
  // tekshirilmagan payload yozilmaydi (xavfsiz default).
  verifyLicense?: (data: LicenseData) => Promise<boolean>;
  // FX-07 (LA-16, X-4) — `LICENSE_REVOKED` bayonotining imzosi/bog'lanishi.
  // STANDART qiymati haqiqiy tekshiruv (`isRevocationAuthenticForThisMachine`).
  verifyRevocation?: (revocation: unknown, current: LicenseData) => Promise<boolean>;
  log: HeartbeatLogger;
}

/**
 * Bitta heartbeat tekshiruvi (CLI-387). To'liq injectable — Postgres/Redis/
 * haqiqiy Supervisor'siz unit-testable.
 *
 * - `.lic` yo'q (hali faollashtirilmagan YOKI cloud/dev deployment) → no-op.
 * - Muvaffaqiyatli (200) → Supervisor yangi imzolangan `LicenseData` qaytaradi
 *   (activate bilan bir xil shakl) → imzo + fingerprint tekshiriladi (FX-06) →
 *   cache yangilanadi (`writeLicense`). Tekshiruvdan o'tmasa — faqat log, eski
 *   `.lic` va langar tegilmaydi.
 * - `expiresAt` regressiyasi (yangi < joriy — masalan Supervisor bazasi eski
 *   zaxiradan tiklanib eski muddatni qayta imzoladi) → faqat log, eski `.lic`
 *   saqlanadi (FX-07): to'langan uzaytirish jimgina bekor bo'lmasin.
 * - `LICENSE_REVOKED` + IMZOLANGAN `revocation` (FX-07, LA-16) — imzo, shu
 *   mashina fingerprint'i, shu `licenseKey` va joriy `.lic`dan eski bo'lmagan
 *   `issuedAt` tekshiriladi → `.lic` invalidatsiya qilinadi,
 *   `getActiveModules()` keyingi chaqiruvda darhol `[]` qaytaradi. Tekshiruvdan
 *   o'tmasa — faqat log.
 * - Boshqa har qanday xato — imzosiz `INVALID_KEY` (eski Supervisor yoki MITM
 *   403) ham, `UNKNOWN_KEY` (Supervisor'da qator yo'q) ham, tarmoq,
 *   `FINGERPRINT_MISMATCH`, `SUPERVISOR_ERROR`, `FINGERPRINT_UNAVAILABLE` →
 *   faqat log, `.lic` tegilmaydi (offline-resilience global constraint, spec §6).
 *   Imzosiz signal `.lic`ni o'chira olmaydi.
 */
export const runLicenseHeartbeatCheck = async (deps: RunHeartbeatCheckDeps): Promise<void> => {
  const lic = await deps.readLicense();
  if (!lic) return;

  try {
    const fresh = await deps.sendHeartbeat(lic.licenseKey);
    // FX-06 — imzosiz/soxta (MITM, HTTP rejim), boshqa juftlik bilan imzolangan
    // (RSA almashtirildi, FU-54) yoki boshqa mashinaga bog'langan javob yaroqli
    // eski `.lic`ni almashtirmasin: aks holda klinika muddat tugashini kutmasdan
    // `LICENSE_NOT_FOUND` blokiga tushadi. Langar ham tegilmaydi — tekshirilmagan
    // `issuedAt` (masalan kelajakdagi sana) muddatni sun'iy tugatib qo'yardi.
    const verify = deps.verifyLicense ?? isLicenseAuthenticForThisMachine;
    if (!(await verify(fresh))) {
      deps.log.warn(
        { clinicId: lic.clinicId },
        'License heartbeat: response failed signature/fingerprint verification — keeping cached license',
      );
      return;
    }
    // FX-07 (review) — javob SHU litsenziya kaliti uchun bo'lishi shart: boshqa
    // kalitning imzolangan litsenziyasi joriy `.lic` o'rnini egallamasin.
    if (fresh.licenseKey !== lic.licenseKey) {
      deps.log.warn(
        { clinicId: lic.clinicId },
        'License heartbeat: response is for a different license key — keeping cached license',
      );
      return;
    }
    // FX-07 — `expiresAt` orqaga ketmaydi. Zaxiradan tiklangan Supervisor
    // uzaytirishdan OLDINGI muddatni yaroqli imzo bilan qaytaradi; uni yozish
    // to'lov qilgan klinikani bloklardi. Muddatni qisqartirish kerak bo'lsa
    // vendor deaktivatsiya (imzolangan `LICENSE_REVOKED`) qiladi.
    const freshExpiresMs = Date.parse(fresh.expiresAt);
    const currentExpiresMs = Date.parse(lic.expiresAt);
    // Yangi `expiresAt` sana bo'lmasa (NaN) — tekshiruv O'TKAZIB YUBORILMAYDI,
    // javob rad etiladi (imzolangan, lekin litsenziya bo'lmagan payload).
    if (
      !Number.isFinite(freshExpiresMs) ||
      (Number.isFinite(currentExpiresMs) && freshExpiresMs < currentExpiresMs)
    ) {
      deps.log.warn(
        {
          clinicId: lic.clinicId,
          currentExpiresAt: lic.expiresAt,
          freshExpiresAt: fresh.expiresAt,
        },
        'License heartbeat: response expiresAt is missing or earlier than the cached license — keeping cached license',
      );
      return;
    }
    await deps.writeLicense(fresh);
    // CLI-437 + FX-87 — Supervisor'ning imzolangan `issuedAt`i ishonchli server
    // vaqti, mahalliy `Date.now()` esa emas (soat xato oldinga surilgan bo'lishi
    // mumkin) — langar faqat `issuedAt` bilan yangilanadi:
    // - javob keshdagi `.lic`dan YANGI (`issuedAt` kattaroq) → langar aynan
    //   `issuedAt`ga o'rnatiladi, ya'ni oldinga ketib qolgan langar (xato BIOS
    //   soati, FX-160) server vaqtiga PASAYTIRILADI. Bu vendor tomonidagi
    //   tiklash yo'li ham: internet bo'lsa birinchi heartbeat langarni tuzatadi.
    // - yangi bo'lmasa (masalan MITM eski imzolangan javobni qayta yuborsa) →
    //   faqat `max(anchor, issuedAt)`: langar pasaytirilmaydi, aks holda soatni
    //   orqaga surish bilan muddatni cho'zish yo'li ochilardi.
    const anchor = await deps.readAnchor();
    const issuedAtMs = Date.parse(fresh.issuedAt);
    const cachedIssuedAtMs = Date.parse(lic.issuedAt);
    if (Number.isFinite(issuedAtMs)) {
      const isNewer = !Number.isFinite(cachedIssuedAtMs) || issuedAtMs > cachedIssuedAtMs;
      await deps.writeAnchor(isNewer ? issuedAtMs : Math.max(anchor, issuedAtMs));
    }
    deps.log.info({ clinicId: fresh.clinicId }, 'License heartbeat OK — cached .lic refreshed');
  } catch (err) {
    const code = err instanceof Error ? err.message : 'UNKNOWN';
    if (code === 'LICENSE_REVOKED') {
      const body = (err as { body?: { error?: { revocation?: unknown } } }).body;
      const verifyRevocation = deps.verifyRevocation ?? isRevocationAuthenticForThisMachine;
      if (await verifyRevocation(body?.error?.revocation, lic)) {
        await deps.invalidateLicense();
        deps.log.warn(
          { code, clinicId: lic.clinicId },
          'License heartbeat: Supervisor signed revocation verified — .lic invalidated',
        );
        return;
      }
      deps.log.warn(
        { code, clinicId: lic.clinicId },
        'License heartbeat: LICENSE_REVOKED failed signature/binding verification — keeping cached license',
      );
      return;
    }
    // Transient (network) or out-of-scope (FINGERPRINT_MISMATCH — see spec §5) —
    // keep serving off the locally cached signature+expiry+grace check.
    deps.log.warn({ code }, 'License heartbeat failed (non-fatal) — keeping cached license');
  }
};

export const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;

export interface StartHeartbeatSchedulerDeps {
  intervalMs?: number;
  scheduleInterval?: (fn: () => void, ms: number) => unknown;
  clearScheduledInterval?: (handle: unknown) => void;
  runCheck?: () => Promise<void>;
}

/**
 * Davriy heartbeat sikli (CLI-387) — `client-reconnect.ts` DI naqshi
 * takrorlanadi (`scheduleInterval`/`clearScheduledInterval` inject
 * qilinadi, `setInterval`/`clearInterval` to'g'ridan-to'g'ri emas —
 * testlanuvchanlik uchun). Boot'da darhol bir marta ham ishga tushiriladi
 * (server qayta ko'tarilganda 4 soat kutmasdan bekor qilingan litsenziya
 * aniqlanishi uchun), so'ng har `intervalMs`da.
 */
export const startLicenseHeartbeatScheduler = (
  deps: StartHeartbeatSchedulerDeps = {},
): (() => void) => {
  const {
    intervalMs = FOUR_HOURS_MS,
    scheduleInterval = (fn, ms) => setInterval(fn, ms),
    clearScheduledInterval = (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
    runCheck = () =>
      runLicenseHeartbeatCheck({
        readLicense,
        writeLicense,
        invalidateLicense,
        sendHeartbeat,
        readAnchor,
        writeAnchor,
        log: logger,
      }),
  } = deps;

  void runCheck();
  const handle = scheduleInterval(() => {
    void runCheck();
  }, intervalMs);

  return () => clearScheduledInterval(handle);
};
