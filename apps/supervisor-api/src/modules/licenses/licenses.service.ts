import { eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { licenseEvents, licenses } from '../../db/schema';
import { signLicense } from '../../lib/rsa';

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

export const createLicenseService = () => ({
  async activate(licenseKey: string, fingerprint: string) {
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
    return buildResponse({ ...lic, fingerprint }, issuedAt);
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
    // CLI-411 guard yuqorida `lic.fingerprint`'ni non-null qildi — CLI-410
    // imzolangan payload'ga qo'shish uchun aniq beramiz (TS narrowing).
    return buildResponse({ ...lic, fingerprint: lic.fingerprint }, new Date().toISOString());
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
});
