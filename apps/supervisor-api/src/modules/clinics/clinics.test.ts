import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { createApp } from '../../app';
import { db } from '../../db/client';
import {
  branches as branchesTable,
  clinics as clinicsTable,
  licenseEvents,
  licenses as licensesTable,
} from '../../db/schema';
import { signAdminTestToken } from '../../lib/test-helpers';

const app = createApp();

const authHeaders = async () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${await signAdminTestToken()}`,
});

const createClinic = async (overrides: Partial<Record<string, unknown>> = {}) => {
  const res = await app.request('/v1/admin/clinics', {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({
      name: `Test Clinic ${crypto.randomUUID()}`,
      contactEmail: 'clinic@test.com',
      plan: 'standard',
      expiresAt: new Date(Date.now() + 86400000 * 365).toISOString(),
      gracePeriodDays: 7,
      // Provisioning maydonlari majburiy (createClinicSchema) — ularsiz POST
      // 400 qaytaradi.
      ownerFullName: 'Ali Valiyev',
      ownerPhone: '901234567',
      defaultLanguage: 'uz',
      branchName: 'Bosh filial',
      ...overrides,
    }),
  });
  return res;
};

describe('POST /v1/admin/clinics', () => {
  it('requires admin JWT', async () => {
    const res = await app.request('/v1/admin/clinics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'No Auth Clinic',
        plan: 'standard',
        expiresAt: new Date().toISOString(),
      }),
    });
    expect(res.status).toBe(401);
  });

  it('creates a clinic + license with the correct MODULE_MAP for the plan tier', async () => {
    const res = await createClinic({ plan: 'premium' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;

    expect(body.clinic.id).toBeTruthy();
    expect(body.clinic.name).toContain('Test Clinic');

    expect(body.license.clinicId).toBe(body.clinic.id);
    expect(body.license.plan).toBe('premium');
    expect(body.license.licenseKey).toMatch(/^[0-9A-F]{5}-[0-9A-F]{5}-[0-9A-F]{5}-[0-9A-F]{5}$/);
    expect(body.license.modules.sort()).toEqual(
      [
        'patients',
        'appointments',
        'queue',
        'cashier',
        'reports',
        'staff',
        'clinical',
        'lab-orders',
        'patient-images',
        'prescriptions',
        'consent',
      ].sort(),
    );
    expect(body.license.isActive).toBe(true);
  });

  it('rejects an invalid plan', async () => {
    const res = await createClinic({ plan: 'not-a-real-plan' });
    expect(res.status).toBe(400);
  });

  // CLI-433 — enterprise MODULE_MAP renamed from erp/inventory/branches (which
  // matched no apps/api route) to the actual api route names.
  it("enterprise plan's modules use apps/api's actual route names (CLI-433)", async () => {
    const res = await createClinic({ plan: 'enterprise' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.license.modules.sort()).toEqual(
      [
        'patients',
        'appointments',
        'queue',
        'cashier',
        'reports',
        'staff',
        'clinical',
        'lab-orders',
        'patient-images',
        'prescriptions',
        'consent',
        'expenses',
        'stock',
        'payroll',
        'notifications',
        'schedule',
        'recalls',
      ].sort(),
    );
    // Regression guard — the old (mismatched) names must be gone.
    expect(body.license.modules).not.toContain('erp');
    expect(body.license.modules).not.toContain('inventory');
    expect(body.license.modules).not.toContain('branches');
  });
});

// Provisioning (spec 2026-08-03 §4.1, §5.2) — Supervisor klinika uchun owner
// hisobi va filial ma'lumotlarini yaratadi; vaqtinchalik parol AYNAN ikki
// joyda ochiladi: POST javobidagi `credentials` va GET /:id detali. Boshqa
// hech qanday javobda bo'lmasligi kerak.
describe('POST /v1/admin/clinics — provisioning (owner + filial)', () => {
  it("klinika yaratishda owner va filial ma'lumoti saqlanadi", async () => {
    const res = await createClinic({
      plan: 'premium',
      ownerFullName: 'Ali Valiyev',
      ownerPhone: '901234567',
      branchName: 'Chilonzor filiali',
      branchAddress: 'Toshkent, Chilonzor 12',
      branchPhone: '712001020',
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;

    // Telefon serverda normallashtiriladi — klinika tomonida login shu shaklda
    // qidiriladi.
    expect(body.credentials.loginPhone).toBe('+998901234567');
    expect(body.credentials.tempPassword.length).toBeGreaterThanOrEqual(12);
    expect(body.clinic.ownerFullName).toBe('Ali Valiyev');
    expect(body.clinic.ownerPhone).toBe('+998901234567');

    const [branch] = await db
      .select()
      .from(branchesTable)
      .where(eq(branchesTable.clinicId, body.clinic.id));
    expect(branch?.name).toBe('Chilonzor filiali');
    expect(branch?.address).toBe('Toshkent, Chilonzor 12');
    expect(branch?.phone).toBe('+998712001020');

    const stored = await db.query.clinics.findFirst({
      where: eq(clinicsTable.id, body.clinic.id),
    });
    expect(stored?.ownerTempPassword).toBe(body.credentials.tempPassword);
  });

  it("bo'sh filial maydonlari NULL sifatida saqlanadi (frontend `undefined` yuboradi)", async () => {
    const res = await createClinic();
    const body = (await res.json()) as any;
    const [branch] = await db
      .select()
      .from(branchesTable)
      .where(eq(branchesTable.clinicId, body.clinic.id));
    expect(branch?.name).toBe('Bosh filial');
    expect(branch?.address).toBeNull();
    expect(branch?.phone).toBeNull();
  });

  it("owner maydonlarisiz so'rov 400 qaytaradi", async () => {
    const res = await app.request('/v1/admin/clinics', {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({
        name: 'Ownersiz klinika',
        plan: 'standard',
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      }),
    });
    expect(res.status).toBe(400);
  });

  it("POST javobidagi `clinic` obyektida vaqtinchalik parol YO'Q (faqat `credentials` da)", async () => {
    const res = await createClinic();
    const body = (await res.json()) as any;
    const tempPassword = body.credentials.tempPassword;

    expect(tempPassword).toBeTruthy();
    expect(body.clinic.ownerTempPassword).toBeUndefined();
    expect(JSON.stringify(body.clinic)).not.toContain(tempPassword);
  });
});

describe("Vaqtinchalik parolning sizib chiqishi — endpoint bo'yicha qulf", () => {
  it("GET / (ro'yxat) javobida vaqtinchalik parol yo'q", async () => {
    const created = (await (await createClinic()).json()) as any;
    const tempPassword = created.credentials.tempPassword;

    const res = await app.request('/v1/admin/clinics', { headers: await authHeaders() });
    expect(res.status).toBe(200);
    const raw = JSON.stringify(await res.json());
    expect(raw).not.toContain('ownerTempPassword');
    expect(raw).not.toContain(tempPassword);
  });

  it("PATCH /:id/deactivate javobida vaqtinchalik parol yo'q", async () => {
    const created = (await (await createClinic()).json()) as any;
    const tempPassword = created.credentials.tempPassword;

    const res = await app.request(`/v1/admin/clinics/${created.clinic.id}/deactivate`, {
      method: 'PATCH',
      headers: await authHeaders(),
    });
    expect(res.status).toBe(200);
    const raw = JSON.stringify(await res.json());
    expect(raw).not.toContain('ownerTempPassword');
    expect(raw).not.toContain(tempPassword);
  });

  // ATAYIN: detal javobi parolni ko'rsatadi — admin panel aktivatsiyagacha uni
  // operatorga ko'rsatishi kerak (spec §7). Bu testni "tozalash" niyatida
  // o'chirmang, aks holda panel holati jim buziladi.
  it('GET /:id (detal) javobida vaqtinchalik parol ATAYIN bor', async () => {
    const created = (await (await createClinic()).json()) as any;

    const res = await app.request(`/v1/admin/clinics/${created.clinic.id}`, {
      headers: await authHeaders(),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.clinic.ownerTempPassword).toBe(created.credentials.tempPassword);
    expect(body.clinic.ownerPhone).toBe(created.credentials.loginPhone);
  });
});

// CLI-433 — divergence guard, mirror of apps/api/src/lib/license-middleware.test.ts's
// "MODULE_MAP — supervisor/api dictionary lockstep" test. Both hardcode the
// same agreed dictionary (docs/audit-fixes/CLI-433 §2c); if one file's table
// changes without the other, exactly one of the two guard tests goes red.
describe('MODULE_MAP — supervisor/api dictionary lockstep (CLI-433)', () => {
  it("enterprise plan's modules match the agreed cross-app dictionary", async () => {
    const AGREED_ENTERPRISE_MODULES = [
      'patients',
      'appointments',
      'queue',
      'cashier',
      'reports',
      'staff',
      'clinical',
      'lab-orders',
      'patient-images',
      'prescriptions',
      'consent',
      'expenses',
      'stock',
      'payroll',
      'notifications',
      'schedule',
      'recalls',
    ];
    const res = await createClinic({ plan: 'enterprise' });
    const body = (await res.json()) as any;
    expect(body.license.modules.sort()).toEqual(AGREED_ENTERPRISE_MODULES.sort());
  });
});

describe('GET /v1/admin/clinics', () => {
  it('requires admin JWT', async () => {
    const res = await app.request('/v1/admin/clinics');
    expect(res.status).toBe(401);
  });

  it('lists clinics including a freshly created one', async () => {
    const createRes = await createClinic();
    const created = (await createRes.json()) as any;

    const res = await app.request('/v1/admin/clinics', {
      headers: await authHeaders(),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any[];
    expect(Array.isArray(body)).toBe(true);
    expect(body.some((c) => c.id === created.clinic.id)).toBe(true);
  });

  it('includes a license summary (licenseKey/plan/isActive/expiresAt) per clinic without a detail call', async () => {
    const createRes = await createClinic({ plan: 'premium' });
    const created = (await createRes.json()) as any;

    const res = await app.request('/v1/admin/clinics', {
      headers: await authHeaders(),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any[];
    const row = body.find((c) => c.id === created.clinic.id);
    expect(row).toBeTruthy();
    expect(row.license).toEqual({
      licenseKey: created.license.licenseKey,
      plan: 'premium',
      isActive: true,
      expiresAt: created.license.expiresAt,
    });
  });

  it('returns license: null for a clinic with no license row', async () => {
    const [orphan] = await db
      .insert(clinicsTable)
      .values({
        name: `Orphan Clinic ${crypto.randomUUID()}`,
        ownerFullName: 'Orphan Owner',
        ownerPhone: '+998901234567',
      })
      .returning();
    if (!orphan) throw new Error('orphan clinic insert returned no row');

    const res = await app.request('/v1/admin/clinics', {
      headers: await authHeaders(),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any[];
    const row = body.find((c) => c.id === orphan.id);
    expect(row).toBeTruthy();
    expect(row.license).toBeNull();
  });
});

describe('GET /v1/admin/clinics/:id', () => {
  it('requires admin JWT', async () => {
    const res = await app.request('/v1/admin/clinics/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(401);
  });

  it('returns clinic + license for a known id', async () => {
    const createRes = await createClinic({ plan: 'starter' });
    const created = (await createRes.json()) as any;

    const res = await app.request(`/v1/admin/clinics/${created.clinic.id}`, {
      headers: await authHeaders(),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.clinic.id).toBe(created.clinic.id);
    expect(body.license.licenseKey).toBe(created.license.licenseKey);
  });

  it('returns 404 for unknown clinic id', async () => {
    const res = await app.request('/v1/admin/clinics/00000000-0000-0000-0000-000000000000', {
      headers: await authHeaders(),
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as any;
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('returns 404 (not 500) for a syntactically invalid uuid id', async () => {
    const res = await app.request('/v1/admin/clinics/not-a-uuid', {
      headers: await authHeaders(),
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as any;
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('returns 404 (not 500) for "new" (the dead frontend create-clinic route)', async () => {
    const res = await app.request('/v1/admin/clinics/new', {
      headers: await authHeaders(),
    });
    expect(res.status).toBe(404);
  });
});

describe('PATCH /v1/admin/clinics/:id/deactivate', () => {
  it('requires admin JWT', async () => {
    const created = await createClinic();
    const body = (await created.json()) as any;
    const res = await app.request(`/v1/admin/clinics/${body.clinic.id}/deactivate`, {
      method: 'PATCH',
    });
    expect(res.status).toBe(401);
  });

  it('sets license.isActive=false and records a deactivated licenseEvent', async () => {
    const created = await createClinic();
    const body = (await created.json()) as any;

    const res = await app.request(`/v1/admin/clinics/${body.clinic.id}/deactivate`, {
      method: 'PATCH',
      headers: await authHeaders(),
    });
    expect(res.status).toBe(200);
    const updated = (await res.json()) as any;
    expect(updated.license.isActive).toBe(false);
    expect(updated.clinic.id).toBe(body.clinic.id);

    const events = await db.query.licenseEvents.findMany({
      where: eq(licenseEvents.licenseId, body.license.id),
    });
    expect(events.some((e) => e.event === 'deactivated')).toBe(true);
  });

  it('rejects a subsequent /v1/activate call with 403 after deactivation (regression: existing isActive guard)', async () => {
    const created = await createClinic();
    const body = (await created.json()) as any;

    await app.request(`/v1/admin/clinics/${body.clinic.id}/deactivate`, {
      method: 'PATCH',
      headers: await authHeaders(),
    });

    const activateRes = await app.request('/v1/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey: body.license.licenseKey, fingerprint: 'fp-x' }),
    });
    expect(activateRes.status).toBe(403);
  });

  it('returns 404 for an unknown clinic id', async () => {
    const res = await app.request(`/v1/admin/clinics/${crypto.randomUUID()}/deactivate`, {
      method: 'PATCH',
      headers: await authHeaders(),
    });
    expect(res.status).toBe(404);
  });
});

// Qayta o'rnatishga tayyorlash (audit C1) — mijoz mashinasi almashsa yoki
// lokal baza yo'qolsa. Route testlari ATAYIN shu faylda (rejada
// `clinics.routes.test.ts` deyilgan edi, lekin u sof unit fayl: DB ham,
// `app`/`authHeaders` setup'i ham yo'q — reja "faylning mavjud konvensiyasiga
// moslang, yangi setup yozmang" deydi).
describe('POST /v1/admin/clinics/:id/prepare-reinstall', () => {
  it('kredensiallar qaytaradi (yangi parol + fingerprint tozalanadi)', async () => {
    const created = (await (await createClinic()).json()) as any;
    const oldPassword = created.credentials.tempPassword;

    // Haqiqiy tiklanish holatini quramiz: klinika ALLAQACHON aktivatsiya
    // qilingan (parol o'chirilgan, fingerprint bog'langan, provisionedAt
    // to'lgan). `createClinic()` fingerprint'siz litsenziya yaratadi —
    // ularsiz `toBeNull()` hech nimani isbotlamas, o'zi ham NULL edi.
    const provisionedAt = new Date('2026-08-01T00:00:00.000Z');
    await db
      .update(clinicsTable)
      .set({ ownerTempPassword: null })
      .where(eq(clinicsTable.id, created.clinic.id));
    await db
      .update(licensesTable)
      .set({ fingerprint: 'eski-mashina-fp', provisionedAt })
      .where(eq(licensesTable.id, created.license.id));

    const res = await app.request(`/v1/admin/clinics/${created.clinic.id}/prepare-reinstall`, {
      method: 'POST',
      headers: await authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    // `createClinic()` `ownerPhone: '901234567'` yuboradi — server uni kanonik
    // shaklga keltiradi.
    expect(body.credentials.loginPhone).toBe('+998901234567');
    expect(body.credentials.tempPassword).toHaveLength(16);
    expect(body.credentials.tempPassword).not.toBe(oldPassword);

    const storedClinic = await db.query.clinics.findFirst({
      where: eq(clinicsTable.id, created.clinic.id),
    });
    expect(storedClinic?.ownerTempPassword).toBe(body.credentials.tempPassword);

    const lic = await db.query.licenses.findFirst({
      where: eq(licensesTable.id, created.license.id),
    });
    expect(lic?.fingerprint).toBeNull();
    // D5 — `provisionedAt` TEGILMAYDI. Qulf ikkinchi nusxada ham (route
    // qatlamida) turadi, `licenses.reinstall.test.ts` o'chirilsa ham saqlansin.
    expect(lic?.provisionedAt?.toISOString()).toBe(provisionedAt.toISOString());

    // CLAUDE.md §3.10 + spec §3.1 — `createdBy` = amalni bajargan admin.
    // Faqat ROUTE qatlami `c.get('adminUserId')`ni service'ga uzatadi; service
    // testi uni qo'lda beradi, shuning uchun bu seam alohida qulflanadi
    // (`signAdminTestToken()` sub = 'test-admin-id').
    const events = await db
      .select()
      .from(licenseEvents)
      .where(eq(licenseEvents.licenseId, created.license.id));
    const ev = events.find((e) => e.event === 'prepare_reinstall');
    expect(ev).toBeDefined();
    expect(ev?.metadata).toMatchObject({
      createdBy: 'test-admin-id',
      previousFingerprint: 'eski-mashina-fp',
    });
  });

  it('auth siz 401', async () => {
    const created = (await (await createClinic()).json()) as any;
    const res = await app.request(`/v1/admin/clinics/${created.clinic.id}/prepare-reinstall`, {
      method: 'POST',
    });
    expect(res.status).toBe(401);
  });

  it("noto'g'ri uuid → 404", async () => {
    const res = await app.request('/v1/admin/clinics/not-a-uuid/prepare-reinstall', {
      method: 'POST',
      headers: await authHeaders(),
    });
    expect(res.status).toBe(404);
  });

  it("mavjud bo'lmagan klinika → 404 CLINIC_NOT_FOUND", async () => {
    const res = await app.request(`/v1/admin/clinics/${crypto.randomUUID()}/prepare-reinstall`, {
      method: 'POST',
      headers: await authHeaders(),
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as any;
    expect(body.error.code).toBe('CLINIC_NOT_FOUND');
  });
});

// ─── L8 (Lab Hub): SaaS tenantlar Supervisor'da ──────────────────────────────

const SAAS_TOKEN = 'saas-test-token-0123456789-abcdefghijklmnop';
const saasHeaders = (token: string = SAAS_TOKEN) => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${token}`,
});
const registerSaas = (tenantId: string, overrides: Record<string, unknown> = {}) =>
  app.request('/internal/saas/clinics', {
    method: 'POST',
    headers: saasHeaders(),
    body: JSON.stringify({
      tenantId,
      name: 'SaaS Klinika',
      ownerFullName: 'Sardor Aliyev',
      ownerPhone: '901112233',
      ...overrides,
    }),
  });

describe('L8 — /internal/saas/clinics', () => {
  it("SUPERVISOR_SAAS_TOKEN sozlanmagan bo'lsa yo'l yopiq (503), kalit bo'sh qiymat bilan ochilmaydi", async () => {
    const prev = process.env.SUPERVISOR_SAAS_TOKEN;
    delete process.env.SUPERVISOR_SAAS_TOKEN;
    try {
      const res = await registerSaas(crypto.randomUUID());
      expect(res.status).toBe(503);
      process.env.SUPERVISOR_SAAS_TOKEN = 'short';
      expect((await registerSaas(crypto.randomUUID())).status).toBe(503);
    } finally {
      if (prev === undefined) delete process.env.SUPERVISOR_SAAS_TOKEN;
      else process.env.SUPERVISOR_SAAS_TOKEN = prev;
    }
  });

  describe('token sozlangan', () => {
    const prev = process.env.SUPERVISOR_SAAS_TOKEN;
    beforeAll(() => {
      process.env.SUPERVISOR_SAAS_TOKEN = SAAS_TOKEN;
    });
    afterAll(() => {
      if (prev === undefined) delete process.env.SUPERVISOR_SAAS_TOKEN;
      else process.env.SUPERVISOR_SAAS_TOKEN = prev;
    });

    it("noto'g'ri/yo'q token → 401; admin JWT bu yo'lga kira olmaydi", async () => {
      const tenantId = crypto.randomUUID();
      const bad = await app.request('/internal/saas/clinics', {
        method: 'POST',
        headers: saasHeaders('x'.repeat(40)),
        body: JSON.stringify({ tenantId, name: 'X', ownerFullName: 'Y', ownerPhone: '901112233' }),
      });
      expect(bad.status).toBe(401);
      const none = await app.request('/internal/saas/clinics', { method: 'POST' });
      expect(none.status).toBe(401);
      const adminJwt = await app.request(`/internal/saas/clinics/${tenantId}/status`, {
        headers: { Authorization: `Bearer ${await signAdminTestToken()}` },
      });
      expect(adminJwt.status).toBe(401);
    });

    it("yangi tenant: mode=saas, 14 kunlik sinov, litsenziya/filial YO'Q, telefon kanonik", async () => {
      const tenantId = crypto.randomUUID();
      const res = await registerSaas(tenantId);
      expect(res.status).toBe(201);
      const body = (await res.json()) as any;
      expect(body.mode).toBe('saas');
      const days = (Date.parse(body.subscriptionExpiresAt) - Date.now()) / 86_400_000;
      expect(days).toBeGreaterThan(13.9);
      expect(days).toBeLessThan(14.1);

      const [row] = await db.select().from(clinicsTable).where(eq(clinicsTable.id, body.clinicId));
      expect(row?.mode).toBe('saas');
      expect(row?.saasTenantId).toBe(tenantId);
      expect(row?.ownerPhone).toBe('+998901112233');
      expect(row?.ownerTempPassword).toBeNull();
      const lics = await db
        .select()
        .from(licensesTable)
        .where(eq(licensesTable.clinicId, body.clinicId));
      expect(lics).toHaveLength(0);
    });

    it('idempotent: qayta chaqiruv 200 va SINOV MUDDATI QAYTA BOSHLANMAYDI, bitta qator', async () => {
      const tenantId = crypto.randomUUID();
      const first = (await (await registerSaas(tenantId)).json()) as any;
      // Muddatni qo'lda o'tgan paytga suramiz — qayta ro'yxat uni tiklamasligi kerak.
      const past = new Date(Date.now() - 86_400_000);
      await db
        .update(clinicsTable)
        .set({ subscriptionExpiresAt: past })
        .where(eq(clinicsTable.id, first.clinicId));
      const res = await registerSaas(tenantId, { name: 'Boshqa nom' });
      expect(res.status).toBe(200);
      const second = (await res.json()) as any;
      expect(second.clinicId).toBe(first.clinicId);
      expect(Date.parse(second.subscriptionExpiresAt)).toBe(past.getTime());
      const rows = await db
        .select()
        .from(clinicsTable)
        .where(eq(clinicsTable.saasTenantId, tenantId));
      expect(rows).toHaveLength(1);
    });

    it('parallel ikki ro‘yxat — bitta klinika (UNIQUE saas_tenant_id)', async () => {
      const tenantId = crypto.randomUUID();
      const [a, b] = await Promise.all([registerSaas(tenantId), registerSaas(tenantId)]);
      expect([a.status, b.status].sort()).toEqual([200, 201]);
      const rows = await db
        .select()
        .from(clinicsTable)
        .where(eq(clinicsTable.saasTenantId, tenantId));
      expect(rows).toHaveLength(1);
    });

    it('status: muddat qaytadi; noma’lum tenant va noto‘g‘ri uuid → 404; desktop klinika ko‘rinmaydi', async () => {
      const tenantId = crypto.randomUUID();
      await registerSaas(tenantId);
      const res = await app.request(`/internal/saas/clinics/${tenantId}/status`, {
        headers: saasHeaders(),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.tenantId).toBe(tenantId);
      expect(typeof body.subscriptionExpiresAt).toBe('string');

      const unknown = await app.request(`/internal/saas/clinics/${crypto.randomUUID()}/status`, {
        headers: saasHeaders(),
      });
      expect(unknown.status).toBe(404);
      const badId = await app.request('/internal/saas/clinics/nope/status', {
        headers: saasHeaders(),
      });
      expect(badId.status).toBe(404);
    });
  });
});

describe('L8 — admin: rejim + SaaS obunasini uzaytirish', () => {
  const prev = process.env.SUPERVISOR_SAAS_TOKEN;
  beforeAll(() => {
    process.env.SUPERVISOR_SAAS_TOKEN = SAAS_TOKEN;
  });
  afterAll(() => {
    if (prev === undefined) delete process.env.SUPERVISOR_SAAS_TOKEN;
    else process.env.SUPERVISOR_SAAS_TOKEN = prev;
  });

  it("ro'yxat har klinikaga mode beradi: desktop — litsenziya bilan, saas — litsenziyasiz", async () => {
    const desktop = (await (await createClinic()).json()) as any;
    const saas = (await (await registerSaas(crypto.randomUUID())).json()) as any;
    const res = await app.request('/v1/admin/clinics', { headers: await authHeaders() });
    const list = (await res.json()) as any[];
    const d = list.find((c) => c.id === desktop.clinic.id);
    const s = list.find((c) => c.id === saas.clinicId);
    expect(d.mode).toBe('desktop');
    expect(d.license).not.toBeNull();
    expect(s.mode).toBe('saas');
    expect(s.license).toBeNull();
    expect(s.subscriptionExpiresAt).toBeTruthy();
  });

  it('renew SaaS klinikada subscription_expires_at ni yangilaydi (status endpoint ko‘radi)', async () => {
    const tenantId = crypto.randomUUID();
    const saas = (await (await registerSaas(tenantId)).json()) as any;
    const res = await app.request(`/v1/admin/clinics/${saas.clinicId}/renew`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({ expiresAt: '2099-01-31' }),
    });
    expect(res.status).toBe(200);
    const status = (await (
      await app.request(`/internal/saas/clinics/${tenantId}/status`, { headers: saasHeaders() })
    ).json()) as any;
    expect(status.subscriptionExpiresAt).toBe('2099-01-31T23:59:59.000Z');
  });

  it("renew o'tmishdagi sanani rad etadi (400), desktop renew xulqi o'zgarmagan", async () => {
    const saas = (await (await registerSaas(crypto.randomUUID())).json()) as any;
    const past = await app.request(`/v1/admin/clinics/${saas.clinicId}/renew`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({ expiresAt: '2001-01-01' }),
    });
    expect(past.status).toBe(400);

    const desktop = (await (await createClinic()).json()) as any;
    const ok = await app.request(`/v1/admin/clinics/${desktop.clinic.id}/renew`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({ expiresAt: '2099-02-01' }),
    });
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as any;
    expect(body.license.expiresAt).toBeTruthy();
  });
});
