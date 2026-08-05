import { beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { branches, clinics, licenseEvents, licenses } from '../../db/schema';
import { createLicenseService } from './licenses.service';

const service = createLicenseService();

let clinicId: string;
let licenseId: string;
let licenseKey: string;

// ⚠️ Bu fayl jadvallarni TRUNCATE QILMAYDI (rejadagi snippetdan og'ish).
// `db.delete(clinics)` branches/licenses/license_events bo'ylab cascade qilib
// lokal Supervisor bazasini (jumladan Windows runbook'idagi qo'lda-test
// litsenziyasini) o'chirib yuborardi. Qo'shni fayllar (`licenses.test.ts`,
// `clinics.test.ts`) ham truncate qilmaydi — har biri o'z unikal fixture'ini
// yaratadi. Barcha assertion'lar ID bo'yicha scope qilingan, shuning uchun
// toza jadval kerak emas.
beforeEach(async () => {
  const [clinic] = await db
    .insert(clinics)
    .values({
      name: 'Test Klinika',
      ownerFullName: 'Aliyev Vali',
      ownerPhone: '+998901234567',
      ownerTempPassword: null, // allaqachon provision qilingan
      defaultLanguage: 'uz',
    })
    .returning();
  clinicId = clinic!.id;

  const [branch] = await db.insert(branches).values({ clinicId, name: 'Bosh filial' }).returning();

  // Unikal kalit: `licenses.license_key` UNIQUE, truncate qilmaganimiz
  // uchun qat'iy qiymat takroriy yugurishda to'qnashardi.
  licenseKey = `REINSTALL-${crypto.randomUUID()}`;

  const [lic] = await db
    .insert(licenses)
    .values({
      clinicId,
      branchId: branch!.id,
      licenseKey,
      plan: 'premium',
      modules: ['patients'],
      gracePeriodDays: 30,
      expiresAt: new Date('2027-12-31'),
      isActive: true,
      fingerprint: 'eski-mashina-fp',
      provisionedAt: new Date('2026-08-01'),
    })
    .returning();
  licenseId = lic!.id;
});

describe('prepareReinstall', () => {
  test('yangi vaqtinchalik parol yozadi va fingerprint tozalaydi', async () => {
    const result = await service.prepareReinstall(clinicId, 'admin-1');

    expect(result.loginPhone).toBe('+998901234567');
    expect(result.tempPassword).toHaveLength(16);

    const clinic = await db.query.clinics.findFirst({ where: eq(clinics.id, clinicId) });
    expect(clinic!.ownerTempPassword).toBe(result.tempPassword);

    const lic = await db.query.licenses.findFirst({ where: eq(licenses.id, licenseId) });
    expect(lic!.fingerprint).toBeNull();
  });

  test('provisionedAt ga TEGMAYDI (D5 regressiya qulfi)', async () => {
    // provisionedAt NULL qilinsa heartbeat clearTempPassword chaqirib parolni
    // mijoz aktivatsiya qilishga ulgurmasdan o'chiradi (licenses.service.ts:178).
    await service.prepareReinstall(clinicId, 'admin-1');

    const lic = await db.query.licenses.findFirst({ where: eq(licenses.id, licenseId) });
    expect(lic!.provisionedAt).not.toBeNull();
    expect(lic!.provisionedAt!.toISOString()).toBe(new Date('2026-08-01').toISOString());
  });

  // Spec §6 ("Qamrov") ATAYIN talab qiladigan qadam: yuqoridagi testlar HOLATNI
  // (parol yozildi, fingerprint tozalandi, provisionedAt saqlandi) isbotlaydi,
  // bu esa OQIBATNI — C1 zanjirining haqiqiy kafolati. Amaldagi tekshiruv
  // `provisioning.ownerPassword === tempPassword`: vendor operatorga o'qib
  // beradigan parol AYNAN mijoz mashinasi provision qiladigan parol.
  //
  // Service qatlamida (route emas) — `POST /v1/activate` request sxemasi
  // fixture'imizdagi `REINSTALL-<uuid>` kalitini formati bo'yicha rad etishi
  // mumkin, bu esa fantom xato quvishga olib borardi.
  test('undan keyin activate provisioning blokini QAYTARADI (C1 oqibati)', async () => {
    const { tempPassword } = await service.prepareReinstall(clinicId, 'admin-1');

    const act = await service.activate(licenseKey, 'yangi-mashina-fp');

    expect(act.provisioning).toBeDefined();
    expect(act.provisioningSignature).toBeTruthy();
    expect(act.provisioning!.ownerPassword).toBe(tempPassword);
    expect(act.provisioning!.ownerPhone).toBe('+998901234567');
    expect(act.provisioning!.tenantName).toBe('Test Klinika');

    // D5 ning OQIBATI: boot'dagi birinchi heartbeat parolni o'chirib
    // yubormaydi (mijoz hali provisioning'ni qo'llashga ulgurmagan).
    // `provisionedAt` NULL bo'lsa shu yerda parol yo'qolardi.
    await service.heartbeat(licenseKey, 'yangi-mashina-fp');
    const clinic = await db.query.clinics.findFirst({ where: eq(clinics.id, clinicId) });
    expect(clinic!.ownerTempPassword).toBe(tempPassword);
  });

  test('audit event yozadi', async () => {
    await service.prepareReinstall(clinicId, 'admin-1');

    const events = await db
      .select()
      .from(licenseEvents)
      .where(eq(licenseEvents.licenseId, licenseId));
    const ev = events.find((e) => e.event === 'prepare_reinstall');
    expect(ev).toBeDefined();
    expect(ev!.metadata).toMatchObject({ createdBy: 'admin-1' });
  });

  test("ownerPhone bo'sh bo'lsa rad etadi (D7)", async () => {
    await db.update(clinics).set({ ownerPhone: '' }).where(eq(clinics.id, clinicId));

    await expect(service.prepareReinstall(clinicId, 'admin-1')).rejects.toThrow(
      'OWNER_PHONE_MISSING',
    );
  });

  test('klinika topilmasa rad etadi', async () => {
    await expect(
      service.prepareReinstall('00000000-0000-0000-0000-000000000000', 'admin-1'),
    ).rejects.toThrow('CLINIC_NOT_FOUND');
  });

  test('litsenziya topilmasa rad etadi', async () => {
    await db.delete(licenses).where(eq(licenses.id, licenseId));

    await expect(service.prepareReinstall(clinicId, 'admin-1')).rejects.toThrow(
      'LICENSE_NOT_FOUND',
    );
  });
});
