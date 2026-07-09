import { beforeEach, describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { createApp } from '../../app';
import { db } from '../../db/client';
import { branches, clinics, licenseResetTokens, licenses } from '../../db/schema';
import { signAdminTestToken } from '../../lib/test-helpers';
import { createLicenseService } from './licenses.service';

const app = createApp();
const service = createLicenseService();

let licenseId: string;
let licenseKey: string;

beforeEach(async () => {
  const [clinic] = await db.insert(clinics).values({ name: 'Reset Test Clinic' }).returning();
  if (!clinic) throw new Error('clinic insert returned no row');
  const [branch] = await db
    .insert(branches)
    .values({ clinicId: clinic.id, name: 'Main' })
    .returning();
  if (!branch) throw new Error('branch insert returned no row');
  licenseKey = `RESET-TEST-${crypto.randomUUID()}`;
  const [license] = await db
    .insert(licenses)
    .values({
      clinicId: clinic.id,
      branchId: branch.id,
      licenseKey,
      plan: 'standard',
      modules: ['patients', 'appointments', 'cashier'],
      gracePeriodDays: 30,
      expiresAt: new Date(Date.now() + 86400000 * 365),
      isActive: true,
    })
    .returning();
  if (!license) throw new Error('license insert returned no row');
  licenseId = license.id;
});

describe('createResetToken', () => {
  it('XXXXX-XXXXX-XXXXX formatida token qaytaradi va faqat hash saqlaydi', async () => {
    const { resetToken } = await service.createResetToken(licenseId);
    expect(resetToken).toMatch(/^[0-9A-F]{5}-[0-9A-F]{5}-[0-9A-F]{5}$/);

    const [row] = await db
      .select()
      .from(licenseResetTokens)
      .where(eq(licenseResetTokens.licenseId, licenseId));
    expect(row).toBeTruthy();
    expect(row?.tokenHash).not.toBe(resetToken);
    expect(row?.tokenHash).toBe(createHash('sha256').update(resetToken).digest('hex'));
    expect(row?.consumedAt).toBeNull();
  });

  it('yangi token avvalgi ishlatilmagan tokenni bekor qiladi', async () => {
    await service.createResetToken(licenseId);
    await service.createResetToken(licenseId);
    const active = await db
      .select()
      .from(licenseResetTokens)
      .where(
        and(eq(licenseResetTokens.licenseId, licenseId), isNull(licenseResetTokens.consumedAt)),
      );
    expect(active).toHaveLength(1);
  });
});

describe('POST /v1/:id/reset-token', () => {
  it("admin JWT bo'lmasa 401", async () => {
    const res = await app.request(`/v1/${licenseId}/reset-token`, { method: 'POST' });
    expect(res.status).toBe(401);
  });

  it('valid admin JWT bilan resetToken qaytaradi', async () => {
    const token = await signAdminTestToken();
    const res = await app.request(`/v1/${licenseId}/reset-token`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { resetToken: string; expiresAt: string };
    expect(body.resetToken).toMatch(/^[0-9A-F]{5}-[0-9A-F]{5}-[0-9A-F]{5}$/);
    expect(body.expiresAt).toBeTruthy();
  });
});
