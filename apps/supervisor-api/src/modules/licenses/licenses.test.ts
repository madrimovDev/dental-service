import { beforeEach, describe, expect, it } from 'bun:test';
import { createPublicKey } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { createApp } from '../../app'; // Hono instansiyasini quradigan factory (index.ts Bun.serve'siz)
import { db } from '../../db/client';
import { branches, clinics, licenseEvents, licenses } from '../../db/schema';
import { verifySignature } from '../../lib/rsa';
import { signAdminTestToken } from '../../lib/test-helpers';
import { createLicenseService, type ProvisioningBlock } from './licenses.service';

const app = createApp();
const service = createLicenseService();

// Servis imzolagan kalitning JUFTI — yangi `generateKeyPair()` EMAS (boshqa
// juft bilan `verifySignature` doim `false` qaytarib, yo'q joyda
// canonicalization bug'i qidirishga olib keladi).
const publicKey = createPublicKey(process.env.RSA_PRIVATE_KEY as string)
  .export({ type: 'spki', format: 'pem' })
  .toString();

let licenseKey: string;
let licenseId: string;
let clinicId: string;

beforeEach(async () => {
  const [clinic] = await db
    .insert(clinics)
    .values({
      name: 'Test Clinic',
      ownerFullName: 'Test Owner',
      ownerPhone: '+998901234567',
      // Provisioning bloki faqat vaqtinchalik parol hali mavjud bo'lganda
      // quriladi — fixture uni aniq beradi.
      ownerTempPassword: 'Temp-Parol-123',
    })
    .returning();
  if (!clinic) throw new Error('clinic insert returned no row');
  clinicId = clinic.id;
  const [branch] = await db
    .insert(branches)
    .values({ clinicId: clinic.id, name: 'Main' })
    .returning();
  if (!branch) throw new Error('branch insert returned no row');
  licenseKey = `TEST-${crypto.randomUUID()}`;
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

describe('POST /v1/provisioned', () => {
  it('applied:false yuborilsa vaqtinchalik parol SAQLANADI', async () => {
    await app.request('/v1/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey, fingerprint: 'fp-abc' }),
    });

    const res = await app.request('/v1/provisioned', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey, fingerprint: 'fp-abc', applied: false }),
    });

    expect(res.status).toBe(200);
    const clinic = await db.query.clinics.findFirst({ where: eq(clinics.id, clinicId) });
    expect(clinic?.ownerTempPassword).toBe('Temp-Parol-123');
  });

  it('`applied` berilmasa eski xulq saqlanadi (parol tozalanadi) — orqaga moslik', async () => {
    await app.request('/v1/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey, fingerprint: 'fp-abc' }),
    });

    const res = await app.request('/v1/provisioned', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey, fingerprint: 'fp-abc' }),
    });

    expect(res.status).toBe(200);
    const clinic = await db.query.clinics.findFirst({ where: eq(clinics.id, clinicId) });
    expect(clinic?.ownerTempPassword).toBeNull();
  });
});

describe('POST /v1/activate', () => {
  it("activates a valid license key va fingerprint bog'laydi", async () => {
    const res = await app.request('/v1/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey, fingerprint: 'fp-abc' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.modules).toContain('patients');
    expect(body.signature).toBeTruthy();
    // CLI-410 — the signed payload now carries the bound fingerprint.
    expect(body.fingerprint).toBe('fp-abc');

    const lic = await db.query.licenses.findFirst({ where: eq(licenses.licenseKey, licenseKey) });
    expect(lic?.fingerprint).toBe('fp-abc');
  });

  it('returns 403 for unknown key', async () => {
    const res = await app.request('/v1/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey: 'WRONG-KEY', fingerprint: 'fp' }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 403 for fingerprint mismatch (allaqachon boshqa qurilmaga bog'langan)", async () => {
    await app.request('/v1/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey, fingerprint: 'fp-first' }),
    });
    const res = await app.request('/v1/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey, fingerprint: 'fp-different' }),
    });
    expect(res.status).toBe(403);
  });
});

describe('POST /v1/heartbeat', () => {
  it('lastHeartbeatAt yangilaydi va joriy modullarni qaytaradi', async () => {
    await app.request('/v1/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey, fingerprint: 'fp-abc' }),
    });
    const res = await app.request('/v1/heartbeat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey, fingerprint: 'fp-abc' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.gracePeriodDays).toBe(30);
  });

  // CLI-411 — never-activated license (fingerprint NULL) must be rejected;
  // heartbeat must NOT silently bind a fingerprint.
  it('aktivlanmagan litsenziya (fingerprint NULL) uchun 403 NOT_ACTIVATED qaytaradi', async () => {
    const res = await app.request('/v1/heartbeat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey, fingerprint: 'fp-any' }),
    });
    expect(res.status).toBe(403);
  });

  it('aktivlanmagan litsenziyaga heartbeat urinishi fingerprint yozmaydi', async () => {
    await app.request('/v1/heartbeat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey, fingerprint: 'fp-any' }),
    });
    const lic = await db.query.licenses.findFirst({ where: eq(licenses.licenseKey, licenseKey) });
    expect(lic?.fingerprint).toBeNull();
  });

  it("aktivlangan mashinaning boshqa fingerprint bilan heartbeat'i 403 (FINGERPRINT_MISMATCH)", async () => {
    await app.request('/v1/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey, fingerprint: 'fp-abc' }),
    });
    const res = await app.request('/v1/heartbeat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey, fingerprint: 'fp-other' }),
    });
    expect(res.status).toBe(403);
  });
});

describe('POST /v1/reactivate', () => {
  it("admin JWT bo'lmasa 401", async () => {
    const res = await app.request('/v1/reactivate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey, fingerprint: 'fp-new' }),
    });
    expect(res.status).toBe(401);
  });

  it("valid admin JWT bilan fingerprint qayta bog'lanadi", async () => {
    const token = await signAdminTestToken(); // test helper — Task 4'dagi jwt.ts bilan bir xil secret
    const res = await app.request('/v1/reactivate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ licenseKey, fingerprint: 'fp-new' }),
    });
    expect(res.status).toBe(200);
    const lic = await db.query.licenses.findFirst({ where: eq(licenses.licenseKey, licenseKey) });
    expect(lic?.fingerprint).toBe('fp-new');
  });

  it('re-enables isActive on a deactivated license', async () => {
    await db.update(licenses).set({ isActive: false }).where(eq(licenses.licenseKey, licenseKey));

    const token = await signAdminTestToken();
    const res = await app.request('/v1/reactivate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ licenseKey, fingerprint: 'fp-new' }),
    });
    expect(res.status).toBe(200);

    const lic = await db.query.licenses.findFirst({ where: eq(licenses.licenseKey, licenseKey) });
    expect(lic?.isActive).toBe(true);
  });
});

describe('provisioning bloki', () => {
  it('aktivatsiya provisioning blokini imzo bilan qaytaradi', async () => {
    const res = await service.activate(licenseKey, 'fp-1');
    expect(res.provisioning).toBeDefined();
    // Aniq tiplangan lokal — `as object` cast qilinsa `ProvisioningBlock`ning
    // maydon-pariteti kompilyatsiya vaqtida tekshirilmay qolardi.
    const prov: ProvisioningBlock = res.provisioning as ProvisioningBlock;
    expect(prov.ownerPhone).toBe('+998901234567');
    expect(prov.ownerPassword).toBe('Temp-Parol-123');
    expect(prov.licenseKey).toBe(licenseKey);
    expect(prov.clinicId).toBe(clinicId);
    expect(prov.issuedAt).toBe(res.issuedAt);
    expect(prov.tenantName).toBe('Test Clinic');
    expect(prov.defaultLanguage).toBe('uz');
    expect(prov.branchName).toBe('Main');
    // Bo'sh maydon HECH QACHON undefined emas — `undefined` bo'lsa
    // JSON.stringify kalitni butunlay tashlaydi va klient tomondagi imzo
    // tekshiruvi mos kelmaydi.
    expect(prov.branchAddress).toBe('');
    expect(prov.branchPhone).toBe('');
    expect(verifySignature(prov, res.provisioningSignature as string, publicKey)).toBe(true);
  });

  it("parol o'chirilgach provisioning bloki qaytarilmaydi", async () => {
    await service.activate(licenseKey, 'fp-1');
    await service.provisioned(licenseKey, 'fp-1');
    const res = await service.activate(licenseKey, 'fp-1');
    expect(res.provisioning).toBeUndefined();
    expect(res.provisioningSignature).toBeUndefined();
  });

  it('provisioned() parolni tozalaydi va hodisa yozadi', async () => {
    await service.activate(licenseKey, 'fp-1');
    await service.provisioned(licenseKey, 'fp-1');
    const clinic = await db.query.clinics.findFirst({ where: eq(clinics.id, clinicId) });
    expect(clinic?.ownerTempPassword).toBeNull();
    const lic = await db.query.licenses.findFirst({ where: eq(licenses.id, licenseId) });
    expect(lic?.provisionedAt).not.toBeNull();
    const events = await db
      .select()
      .from(licenseEvents)
      .where(eq(licenseEvents.licenseId, licenseId));
    expect(events.some((e) => e.event === 'provisioned')).toBe(true);
  });

  it('provisioned(applied=false) parolni SAQLAYDI — tayyorlangan kredensial behuda yonmasin', async () => {
    // Ssenariy: vendor `prepare-reinstall` bajardi, lekin mijoz bazasi BUTUN
    // mashinada aktivatsiya qildi → `applyProvisioning` idempotent skip qildi.
    // Vaqtinchalik parol QO'LLANMAGAN, shuning uchun o'chirilmasligi kerak —
    // aks holda vendor amalni qaytadan bajarishga majbur bo'lardi.
    await service.activate(licenseKey, 'fp-1');
    await service.provisioned(licenseKey, 'fp-1', false);

    const clinic = await db.query.clinics.findFirst({ where: eq(clinics.id, clinicId) });
    expect(clinic?.ownerTempPassword).toBe('Temp-Parol-123');
  });

  it("provisioned(applied=false) 'provisioning_skipped' hodisasini yozadi", async () => {
    // Vendor uchun yagona signal: parol yo'qolishi. Gate qo'yilgach bu signal
    // yo'qoladi — shuning uchun skip ALOHIDA hodisa bilan ko'rinadigan qoladi.
    await service.activate(licenseKey, 'fp-1');
    await service.provisioned(licenseKey, 'fp-1', false);

    const events = await db
      .select()
      .from(licenseEvents)
      .where(eq(licenseEvents.licenseId, licenseId));
    expect(events.some((e) => e.event === 'provisioning_skipped')).toBe(true);
    expect(events.some((e) => e.event === 'provisioned')).toBe(false);
  });

  it('provisioned(applied=false) keyin provisioning bloki HALI ham qaytariladi', async () => {
    // Parol saqlangani uchun mijoz haqiqatan qayta o'rnatganda blok keladi.
    await service.activate(licenseKey, 'fp-1');
    await service.provisioned(licenseKey, 'fp-1', false);

    const res = await service.activate(licenseKey, 'fp-1');
    expect(res.provisioning).toBeDefined();
  });

  it('provisioned() boshqa fingerprint bilan 403 (FINGERPRINT_MISMATCH)', async () => {
    await service.activate(licenseKey, 'fp-1');
    await expect(service.provisioned(licenseKey, 'fp-boshqa')).rejects.toThrow(
      'FINGERPRINT_MISMATCH',
    );
    const clinic = await db.query.clinics.findFirst({ where: eq(clinics.id, clinicId) });
    expect(clinic?.ownerTempPassword).toBe('Temp-Parol-123');
  });

  // Reja Task 5 Step 2 ⚠️ bloki AYNAN shuni talab qiladi: provisioning joriy
  // qilinishidan OLDINGI klinika qatorlarida migratsiya `owner_phone`ni bo'sh
  // satr bilan to'ldirgan. Telefon klinika tomonida login identifikatori
  // (CLAUDE.md §3.1) — telefonsiz owner hisobi yaratilib qolmasin.
  it("bo'sh ownerPhone'li klinikada blok qurilmaydi (migratsiya qatorlari)", async () => {
    await db.update(clinics).set({ ownerPhone: '' }).where(eq(clinics.id, clinicId));
    const res = await service.activate(licenseKey, 'fp-1');
    expect(res.provisioning).toBeUndefined();
    expect(res.provisioningSignature).toBeUndefined();
  });

  it('heartbeat ham parolni tozalaydi (tasdiq yetib bormagan ssenariy)', async () => {
    await service.activate(licenseKey, 'fp-1');
    await service.heartbeat(licenseKey, 'fp-1');
    const clinic = await db.query.clinics.findFirst({ where: eq(clinics.id, clinicId) });
    expect(clinic?.ownerTempPassword).toBeNull();
  });

  // CLAUDE.md §3.10 — maxfiy ma'lumot (vaqtinchalik parol) izsiz o'chmasin.
  // `provisioned()` o'z hodisasini yozadi; heartbeat yo'li ham yozishi shart,
  // aks holda audit jurnalida parol qachon/nima sababdan yo'qolgani ko'rinmaydi.
  it("heartbeat parolni tozalaganda 'provisioned' hodisasi yoziladi", async () => {
    await service.activate(licenseKey, 'fp-1');
    await service.heartbeat(licenseKey, 'fp-1');
    const events = await db
      .select()
      .from(licenseEvents)
      .where(eq(licenseEvents.licenseId, licenseId));
    const prov = events.filter((e) => e.event === 'provisioned');
    expect(prov).toHaveLength(1);
    expect(prov[0]?.metadata).toEqual({ source: 'heartbeat' });
    // Ikkinchi heartbeat takroriy hodisa yozmaydi (provisionedAt to'lgan).
    await service.heartbeat(licenseKey, 'fp-1');
    const after = await db
      .select()
      .from(licenseEvents)
      .where(eq(licenseEvents.licenseId, licenseId));
    expect(after.filter((e) => e.event === 'provisioned')).toHaveLength(1);
  });

  it('POST /v1/provisioned route ishlaydi', async () => {
    await service.activate(licenseKey, 'fp-1');
    const res = await app.request('/v1/provisioned', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey, fingerprint: 'fp-1' }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const clinic = await db.query.clinics.findFirst({ where: eq(clinics.id, clinicId) });
    expect(clinic?.ownerTempPassword).toBeNull();
  });

  it("POST /v1/provisioned noma'lum kalit uchun 403", async () => {
    const res = await app.request('/v1/provisioned', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey: 'WRONG-KEY', fingerprint: 'fp-1' }),
    });
    expect(res.status).toBe(403);
  });
});
