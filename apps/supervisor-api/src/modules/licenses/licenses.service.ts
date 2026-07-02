import { eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { licenseEvents, licenses } from '../../db/schema';
import { signLicense } from '../../lib/rsa';

const PRIVATE_KEY = process.env.RSA_PRIVATE_KEY!; // VPS env'dan

const buildResponse = (lic: typeof licenses.$inferSelect, issuedAt: string) => {
  const payload = {
    licenseKey: lic.licenseKey,
    clinicId: lic.clinicId,
    modules: lic.modules as string[],
    expiresAt: lic.expiresAt.toISOString(),
    gracePeriodDays: lic.gracePeriodDays,
    issuedAt,
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
    if (lic.fingerprint && lic.fingerprint !== fingerprint) {
      throw Object.assign(new Error('FINGERPRINT_MISMATCH'), { status: 403 });
    }
    await db.update(licenses).set({ lastHeartbeatAt: new Date() }).where(eq(licenses.id, lic.id));
    await db.insert(licenseEvents).values({
      licenseId: lic.id,
      event: 'heartbeat',
      fingerprint,
    });
    return buildResponse(lic, new Date().toISOString());
  },

  async reactivate(licenseKey: string, newFingerprint: string) {
    const lic = await db.query.licenses.findFirst({
      where: eq(licenses.licenseKey, licenseKey),
    });
    if (!lic) throw Object.assign(new Error('INVALID_KEY'), { status: 404 });
    await db
      .update(licenses)
      .set({ fingerprint: newFingerprint, lastHeartbeatAt: new Date() })
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
