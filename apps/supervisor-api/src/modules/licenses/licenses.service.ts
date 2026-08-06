import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { db } from '../../db/client';
import { branches, clinics, licenseEvents, licenseResetTokens, licenses } from '../../db/schema';
import { signLicense } from '../../lib/rsa';
import { generateTempPassword } from '../../lib/temp-password';

// CLI-226 — vendor-vositachiligidagi owner parol-tiklash tokeni. Format
// clinics.routes.ts'dagi license-key generator bilan bir xil uslub: 3ta
// 5-belgili HEX-upper segment (`XXXXX-XXXXX-XXXXX`).
const genSegment = () => randomBytes(3).toString('hex').toUpperCase().slice(0, 5);
const genResetToken = () => `${genSegment()}-${genSegment()}-${genSegment()}`;

const PRIVATE_KEY = process.env.RSA_PRIVATE_KEY!; // VPS env'dan

// CLI-410 — `fingerprint` imzolangan payload'ning bir qismi. `fingerprint`
// NON-NULL bo'lishi kafolatlanadi (activate/reactivate aniq fingerprint beradi;
// heartbeat CLI-411 NULL-guard'idan keyin chaqiriladi) — shuning uchun param
// tipi `fingerprint: string` deb toraytiriladi.
type SignableLicense = Omit<typeof licenses.$inferSelect, 'fingerprint'> & { fingerprint: string };

const buildResponse = (lic: SignableLicense, issuedAt: string) => {
  const payload = {
    licenseKey: lic.licenseKey,
    clinicId: lic.clinicId,
    modules: lic.modules as string[],
    expiresAt: lic.expiresAt.toISOString(),
    gracePeriodDays: lic.gracePeriodDays,
    issuedAt,
    fingerprint: lic.fingerprint,
  };
  return {
    ...payload,
    signature: signLicense(payload, PRIVATE_KEY),
  };
};

/**
 * Aktivatsiya javobiga qo'shiladigan provisioning bloki — klinikaning lokal
 * bazasida tenant + owner + filialni birinchi marta yaratish uchun.
 *
 * ⚠️ LOCKSTEP: `apps/api/src/lib/license-client.ts` dagi `ProvisioningBlock`
 * bilan AYNAN bir xil bo'lishi shart (ikki app alohida deploy unit — ular
 * orasida workspace import qirrasi YO'Q, `license-signature.ts` precedenti).
 */
export type ProvisioningBlock = {
  licenseKey: string;
  clinicId: string;
  issuedAt: string;
  tenantName: string;
  defaultLanguage: string;
  ownerFullName: string;
  ownerPhone: string;
  ownerPassword: string;
  branchName: string;
  branchAddress: string;
  branchPhone: string;
};

/**
 * Provisioning bloki QAT'IY TEKIS — `canonicalize` nested obyekt kalitlarini
 * tashlab yuboradi (`lib/rsa.ts` izohiga qarang; `signLicense` endi bunday
 * payload uchun throw qiladi). Bo'sh maydonlar `''` bilan to'ldiriladi:
 * `undefined` bo'lsa `JSON.stringify` kalitni butunlay tashlaydi va klient
 * tomondagi imzo tekshiruvi mos kelmaydi.
 *
 * Blok faqat `ownerTempPassword` hali mavjud bo'lganda quriladi — klinika
 * allaqachon provision qilingan bo'lsa (parol NULL) qaytarilmaydi.
 *
 * `ownerPhone` bo'sh bo'lsa ham qaytarilmaydi: provisioning joriy qilinishidan
 * OLDINGI klinika qatorlarida migratsiya `owner_phone`ni bo'sh satr bilan
 * to'ldirgan (prod'da 648 qator). Ularda `ownerTempPassword` baribir NULL,
 * lekin telefon klinika tomonida login identifikatori (CLAUDE.md §3.1) —
 * telefonsiz hisob yaratilib qolmasligi uchun himoyani ikkilantiramiz.
 */
const buildProvisioning = async (
  lic: typeof licenses.$inferSelect,
  issuedAt: string,
): Promise<{ provisioning: ProvisioningBlock; provisioningSignature: string } | null> => {
  const clinic = await db.query.clinics.findFirst({ where: eq(clinics.id, lic.clinicId) });
  if (!clinic?.ownerTempPassword || !clinic.ownerPhone) return null;
  const branch = await db.query.branches.findFirst({ where: eq(branches.id, lic.branchId) });

  const provisioning: ProvisioningBlock = {
    licenseKey: lic.licenseKey,
    clinicId: lic.clinicId,
    issuedAt,
    tenantName: clinic.name,
    defaultLanguage: clinic.defaultLanguage,
    ownerFullName: clinic.ownerFullName,
    ownerPhone: clinic.ownerPhone,
    ownerPassword: clinic.ownerTempPassword,
    branchName: branch?.name ?? 'Bosh filial',
    branchAddress: branch?.address ?? '',
    branchPhone: branch?.phone ?? '',
  };
  return { provisioning, provisioningSignature: signLicense(provisioning, PRIVATE_KEY) };
};

/**
 * Vaqtinchalik owner parolini Supervisor bazasidan o'chiradi — bundan keyin
 * uni faqat mijoz biladi. `/v1/provisioned` tasdig'i tarmoq sababli yetib
 * bormasligi mumkin, shuning uchun `heartbeat` ham shu ishni bajaradi (parol
 * Supervisor bazasida cheksiz qolib ketmasin).
 */
const clearTempPassword = async (lic: typeof licenses.$inferSelect) => {
  await db.update(clinics).set({ ownerTempPassword: null }).where(eq(clinics.id, lic.clinicId));
  if (!lic.provisionedAt) {
    await db.update(licenses).set({ provisionedAt: new Date() }).where(eq(licenses.id, lic.id));
  }
};

/** `/v1/activate` javobi — litsenziya ma'lumoti + ixtiyoriy provisioning. */
type ActivateResult = ReturnType<typeof buildResponse> & {
  provisioning?: ProvisioningBlock;
  provisioningSignature?: string;
};

export const createLicenseService = () => ({
  async activate(licenseKey: string, fingerprint: string): Promise<ActivateResult> {
    const lic = await db.query.licenses.findFirst({
      where: eq(licenses.licenseKey, licenseKey),
    });
    if (!lic || !lic.isActive) {
      throw Object.assign(new Error('INVALID_KEY'), { status: 403 });
    }
    // Fingerprint bog'lash (birinchi marta)
    if (!lic.fingerprint) {
      await db
        .update(licenses)
        .set({ fingerprint, activatedAt: new Date(), lastHeartbeatAt: new Date() })
        .where(eq(licenses.id, lic.id));
    } else if (lic.fingerprint !== fingerprint) {
      throw Object.assign(new Error('FINGERPRINT_MISMATCH'), { status: 403 });
    }
    await db.insert(licenseEvents).values({
      licenseId: lic.id,
      event: 'activated',
      fingerprint,
    });
    const issuedAt = new Date().toISOString();
    // ⚠️ `buildResponse` o'zgarmaydi — provisioning litsenziya imzosiga
    // KIRMAYDI, o'zining alohida imzosi bor (`.lic` fayliga ham yozilmaydi).
    const base = buildResponse({ ...lic, fingerprint }, issuedAt);
    const prov = await buildProvisioning(lic, issuedAt);
    return prov ? { ...base, ...prov } : base;
  },

  async heartbeat(licenseKey: string, fingerprint: string) {
    const lic = await db.query.licenses.findFirst({
      where: eq(licenses.licenseKey, licenseKey),
    });
    if (!lic || !lic.isActive) {
      throw Object.assign(new Error('INVALID_KEY'), { status: 403 });
    }
    // CLI-411 — heartbeat NIKAKDA fingerprint bog'lamaydi; faqat allaqachon
    // `activate` (yoki admin `reactivate`) orqali bog'langanini tasdiqlaydi.
    // Ilgari `lic.fingerprint && ...` — fingerprint NULL (aktivlanmagan) bo'lsa
    // mismatch-tekshiruvi butunlay o'tkazib yuborilardi → istalgan fingerprint
    // bilan heartbeat muvaffaqiyatli bo'lib, aktivatsiya bosqichini (rate-limit
    // + `event:'activated'` audit) chetlab o'tib cheksiz mashinadan ishlash
    // mumkin edi. Endi NULL → NOT_ACTIVATED (klient allaqachon `.lic`siz —
    // heartbeat yubormaydi; docs/audit-fixes/CLI-411).
    if (!lic.fingerprint) {
      throw Object.assign(new Error('NOT_ACTIVATED'), { status: 403 });
    }
    if (lic.fingerprint !== fingerprint) {
      throw Object.assign(new Error('FINGERPRINT_MISMATCH'), { status: 403 });
    }
    await db.update(licenses).set({ lastHeartbeatAt: new Date() }).where(eq(licenses.id, lic.id));
    await db.insert(licenseEvents).values({
      licenseId: lic.id,
      event: 'heartbeat',
      fingerprint,
    });
    // Klinika ishlayapti demak provisioning qo'llangan — `/v1/provisioned`
    // tasdig'i yetib bormagan bo'lsa ham parolni tozalaymiz. Bir marta:
    // `provisionedAt` to'lgach har heartbeat'da UPDATE yubormaymiz.
    if (!lic.provisionedAt) {
      await clearTempPassword(lic);
      // CLAUDE.md §3.10 — maxfiy ma'lumot izsiz o'chmasin. `metadata.source`
      // bu yo'lni klinikaning aniq tasdig'idan (`provisioned()`) ajratadi.
      await db.insert(licenseEvents).values({
        licenseId: lic.id,
        event: 'provisioned',
        fingerprint,
        metadata: { source: 'heartbeat' },
      });
    }
    // CLI-411 guard yuqorida `lic.fingerprint`'ni non-null qildi — CLI-410
    // imzolangan payload'ga qo'shish uchun aniq beramiz (TS narrowing).
    return buildResponse({ ...lic, fingerprint: lic.fingerprint }, new Date().toISOString());
  },

  /**
   * Klinika provisioning'ni muvaffaqiyatli qo'llagach chaqiriladi (apps/api
   * `/api/activate`dan). Vaqtinchalik parolni Supervisor bazasidan o'chiradi.
   * `activate` kabi fail-closed: fingerprint bog'lanmagan (hali aktivlanmagan)
   * yoki boshqa mashinaning fingerprint'i bo'lsa rad etiladi — provisioning
   * faqat aktivatsiya orqali yetkaziladi (CLI-411 precedenti).
   */
  async provisioned(licenseKey: string, fingerprint: string, applied = true) {
    const lic = await db.query.licenses.findFirst({
      where: eq(licenses.licenseKey, licenseKey),
    });
    if (!lic) throw Object.assign(new Error('INVALID_KEY'), { status: 403 });
    if (!lic.fingerprint) {
      throw Object.assign(new Error('NOT_ACTIVATED'), { status: 403 });
    }
    if (lic.fingerprint !== fingerprint) {
      throw Object.assign(new Error('FINGERPRINT_MISMATCH'), { status: 403 });
    }

    // 🔴 `applied === false` — klinika tomonida provisioning IDEMPOTENT SKIP
    // qilindi (lokal bazada tenant allaqachon bor). Vaqtinchalik parol
    // QO'LLANMAGAN, shuning uchun o'chirilmaydi: aks holda vendor
    // `prepare-reinstall` bilan tayyorlagan kredensial hech qachon
    // ishlatilmasdan yonib ketardi va u amalni qaytadan bajarishga majbur
    // bo'lardi.
    //
    // Hodisa baribir yoziladi — gate qo'yilgunga qadar vendorning yagona
    // signali parolning yo'qolishi edi; endi skip ALOHIDA hodisa bilan
    // ko'rinadi (CLAUDE.md §3.10).
    if (!applied) {
      await db.insert(licenseEvents).values({
        licenseId: lic.id,
        event: 'provisioning_skipped',
        fingerprint,
      });
      return { ok: true as const };
    }

    await clearTempPassword(lic);
    await db.insert(licenseEvents).values({
      licenseId: lic.id,
      event: 'provisioned',
      fingerprint,
    });
    return { ok: true as const };
  },

  /**
   * Vendor amali: klinikani QAYTA O'RNATISHGA tayyorlaydi (audit C1).
   *
   * Ikki ish BIRGA bajariladi — alohida tugmalarda noto'g'ri tartib
   * (avval `reactivate`) aktivatsiyani "muvaffaqiyatli" ko'rsatib, provisioning
   * bloki yo'qligi sababli jim qulflanishni QAYTARARDI:
   *  1. yangi vaqtinchalik parol → `buildProvisioning` yana blok qaytaradi;
   *  2. `fingerprint = NULL` → keyingi `/activate` ISTALGAN mashinaga bog'lanadi
   *     (yangi kompyuter yoki o'sha mashinada tozalangan baza — bir xil yo'l).
   *
   * 🔴 `provisionedAt` ATAYIN O'ZGARTIRILMAYDI. `buildProvisioning` faqat
   * `ownerTempPassword && ownerPhone`ga qaraydi — `provisionedAt`ga EMAS.
   * Agar u NULL qilinsa, `heartbeat`dagi `if (!lic.provisionedAt)` sharti
   * ochilib, birinchi heartbeat (boot'da + har 4 soat) parolni mijoz
   * aktivatsiya qilishga ULGURMASDAN o'chirib yuboradi. Buni
   * "soddalashtirib" NULL qilmang.
   *
   * ⚠️ TAYYORLANGAN KREDENSIAL QANCHA TURADI. Parol quyidagi uch holatdan biri
   * yuz bermaguncha bazada saqlanadi:
   *   (a) mijoz uni ISHLATADI — aktivatsiyada provisioning qo'llanadi va
   *       `/v1/provisioned {applied:true}` uni o'chiradi;
   *   (b) vendor bu amalni QAYTA bajaradi — parol ustiga yoziladi (to'planmaydi,
   *       har klinikada ko'pi bilan bitta);
   *   (c) litsenziya deaktivatsiya qilinadi.
   * Aktivatsiya bo'lib, lekin provisioning skip qilinsa (`applied:false`) parol
   * ATAYIN saqlanadi — u qo'llanmagan, ya'ni hali kerak. Bu — qabul qilingan
   * murosa: kredensial "kutib turadi", chunki uni muddatidan oldin yo'q qilish
   * vendorni amalni qaytadan bajarishga majbur qiladi. Vendor tomonidan qo'lda
   * bekor qilish tugmasi hozircha YO'Q (follow-up ticket).
   *
   * ⚠️ ESKI O'RNATMA DARHOL TO'XTAMAYDI. `fingerprint = NULL` bo'lgach eski
   * mashinaning heartbeat'i `NOT_ACTIVATED` (403) oladi, lekin
   * `apps/api/src/lib/license-heartbeat-scheduler.ts` FAQAT `INVALID_KEY` da
   * `.lic`ni bekor qiladi — qolgan barcha kodlar "vaqtinchalik" deb
   * hisoblanadi (offline-resilience, qasddan). Ya'ni eski o'rnatma keshlangan
   * litsenziya bilan muddat/grace tugagunicha ishlashda davom etadi. Bu
   * mashina almashtirish uchun TO'G'RI xulq (o'tish davrida ikkalasi ham
   * ishlaydi). Darhol to'xtatish kerak bo'lsa — `PATCH /:id/deactivate`.
   * Scheduler'ni "tuzatib" `NOT_ACTIVATED`ni ham invalidatsiya qiluvchi
   * qilmang: unda har bir nosoz Supervisor javobi klinikani litsenziyasiz
   * qoldiradi.
   */
  async prepareReinstall(clinicId: string, adminId?: string) {
    const clinic = await db.query.clinics.findFirst({ where: eq(clinics.id, clinicId) });
    if (!clinic) throw Object.assign(new Error('CLINIC_NOT_FOUND'), { status: 404 });
    // Provisioning bloki `ownerPhone`siz qurilmaydi (buildProvisioning) —
    // parol yozib qo'yish behuda bo'lardi. Migratsiya eski qatorlarni bo'sh
    // satr bilan to'ldirgan.
    if (!clinic.ownerPhone) {
      throw Object.assign(new Error('OWNER_PHONE_MISSING'), { status: 400 });
    }

    const lic = await db.query.licenses.findFirst({ where: eq(licenses.clinicId, clinicId) });
    if (!lic) throw Object.assign(new Error('LICENSE_NOT_FOUND'), { status: 404 });

    const tempPassword = generateTempPassword();

    await db.transaction(async (tx) => {
      await tx
        .update(clinics)
        .set({ ownerTempPassword: tempPassword })
        .where(eq(clinics.id, clinicId));
      await tx.update(licenses).set({ fingerprint: null }).where(eq(licenses.id, lic.id));
      await tx.insert(licenseEvents).values({
        licenseId: lic.id,
        event: 'prepare_reinstall',
        metadata: { createdBy: adminId ?? null, previousFingerprint: lic.fingerprint },
      });
    });

    return { loginPhone: clinic.ownerPhone, tempPassword };
  },

  async reactivate(licenseKey: string, newFingerprint: string) {
    const lic = await db.query.licenses.findFirst({
      where: eq(licenses.licenseKey, licenseKey),
    });
    if (!lic) throw Object.assign(new Error('INVALID_KEY'), { status: 404 });
    await db
      .update(licenses)
      .set({ fingerprint: newFingerprint, lastHeartbeatAt: new Date(), isActive: true })
      .where(eq(licenses.id, lic.id));
    await db.insert(licenseEvents).values({
      licenseId: lic.id,
      event: 'reactivated',
      fingerprint: newFingerprint,
      metadata: { previousFingerprint: lic.fingerprint },
    });
    return buildResponse({ ...lic, fingerprint: newFingerprint }, new Date().toISOString());
  },

  // Vendor admin panel — bir martalik owner parol-tiklash tokeni yaratadi
  // (litsenziya ID bo'yicha). Avvalgi ishlatilmagan tokenlarni bekor qiladi
  // (bir vaqtda faqat bitta faol token bo'lishi kerak). `createdBy` — qaysi
  // admin chiqarganini audit qiladi (CLAUDE.md §3.10).
  async createResetToken(licenseId: string, createdBy?: string) {
    await db
      .update(licenseResetTokens)
      .set({ consumedAt: new Date() })
      .where(
        and(eq(licenseResetTokens.licenseId, licenseId), isNull(licenseResetTokens.consumedAt)),
      );
    const resetToken = genResetToken();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await db.insert(licenseResetTokens).values({
      licenseId,
      tokenHash: createHash('sha256').update(resetToken).digest('hex'),
      expiresAt,
      createdBy,
    });
    return { resetToken, expiresAt };
  },

  // Desktop (online, pre-auth) — vendor-berilgan tokenni bir martalik atomik
  // consume qiladi. Muvaffaqiyatli bo'lsa `license_events`ga 'password_reset'
  // yozadi. Litsenziya/tenant/boshqa foydalanuvchilarga TEGMAYDI — faqat
  // qaror qabul qiladi (owner password_hash'ni yangilash chaqiruvchi
  // (apps/api) tomonda amalga oshadi).
  async verifyReset(licenseKey: string, fingerprint: string, resetToken: string) {
    const lic = await db.query.licenses.findFirst({
      where: eq(licenses.licenseKey, licenseKey),
    });
    if (!lic) return { ok: false as const };
    const hash = createHash('sha256').update(resetToken).digest('hex');
    const [tok] = await db
      .select()
      .from(licenseResetTokens)
      .where(
        and(
          eq(licenseResetTokens.licenseId, lic.id),
          eq(licenseResetTokens.tokenHash, hash),
          isNull(licenseResetTokens.consumedAt),
          gt(licenseResetTokens.expiresAt, new Date()),
        ),
      )
      .limit(1);
    if (!tok) return { ok: false as const };
    if (tok.fingerprint && tok.fingerprint !== fingerprint) return { ok: false as const };
    // Consume + audit-event bitta tranzaksiyada — agar event-insert xato
    // qilsa, token consume bo'lmasdan qoladi (token yo'q joyda audit izsiz
    // "yonib" ketmasligi + handler 500 emas, izchil holat qaytarishi uchun).
    return await db.transaction(async (tx) => {
      // Atomik consume — faqat hali consumedAt NULL bo'lsa muvaffaqiyatli
      // (bir vaqtda ikkita so'rov kelsa ham bittasi g'olib chiqadi).
      const consumed = await tx
        .update(licenseResetTokens)
        .set({ consumedAt: new Date() })
        .where(and(eq(licenseResetTokens.id, tok.id), isNull(licenseResetTokens.consumedAt)))
        .returning();
      if (consumed.length === 0) return { ok: false as const };
      await tx
        .insert(licenseEvents)
        .values({ licenseId: lic.id, event: 'password_reset', fingerprint });
      return { ok: true as const };
    });
  },
});
