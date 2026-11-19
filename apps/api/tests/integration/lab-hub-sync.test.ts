/**
 * Lab Hub W2 (clinic-sync) — klinika `apps/api` ↔ HAQIQIY `apps/lab-hub-api` ilovasi.
 *
 * Hub in-process (`createApp(deps)`) haqiqiy HTTP serverda (`Bun.serve`, port 0) va o'z
 * lane bazasida (`apps/lab-hub-api/.env` → `lab_hub_test_<lane>`, non-superuser rol, RLS)
 * ishlaydi; klinika tomoni — haqiqiy klinika bazasi (RLS, audit). Faqat Supervisor
 * soxta (u Hub'ning bog'liqligi, boshqa ilova). Rollar — real shablon permset'lari
 * (Doctor / Tenant Admin; Accountant — 403), `@owner` EMAS.
 *
 * Tekshiriladi:
 *  - PHI mapper (L3): telefon/manzil/pasport hech qachon Hub so'roviga tushmaydi
 *    (mapper chiqishi + simdagi haqiqiy PUT tanasi) va Hub'ning `.strict()` sxemasi uni qabul qiladi;
 *  - offline navbat: Hub o'chiq → ish navbatda qoladi, qaytganda BIR marta ketadi,
 *    javob yo'qolsa (qayta yuborish) dublikat yo'q (`clinic_case_ref` idempotent);
 *  - poll: lab holati/narx taklifi/xabari klinika buyurtmasiga tushadi + bildirishnoma;
 *    kursor qayta o'qilsa (sahifa qayta kelsa) hech narsa ikki marta qo'llanmaydi;
 *  - narx tasdig'i (L4, pul): «Tasdiqlash» faqat kutish holatini qo'yadi — xarajat FAQAT Hub
 *    tasdiqlaganda (push 2xx yoki poll `price_approved`, qaysi biri birinchi), aynan bitta;
 *    Hub `price.mismatch` → kutish tozalanadi, xarajat yozilmagan;
 *  - ruxsatlar: `lab_order.approve_price` (Technician/Nurse/Receptionist — 403), Doctor ulana olmaydi;
 *  - lab qabul qilgandan keyin tahrir 409, «yetkazildi» faqat `ready`da; remake; lab fayli.
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env --timeout 30000 lab-hub-sync`
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROLE_TEMPLATES } from '@dental/core';
import {
  auditLog,
  expenses,
  labHubOutbox,
  labHubState,
  labOrderFiles,
  labOrderMessages,
  labOrders,
  notifications,
  patients,
  tenantSettings,
  tenants,
  users,
} from '@dental/db-schema';
import { and, eq, sql } from 'drizzle-orm';
import postgres from 'postgres';
import { createApp as createHubApp } from '../../../lab-hub-api/src/app.ts';
import { loadConfig as loadHubConfig } from '../../../lab-hub-api/src/config.ts';
import { createDb as createHubDb } from '../../../lab-hub-api/src/db/client.ts';
import { createKeyring } from '../../../lab-hub-api/src/lib/keyring.ts';
import { createStorage } from '../../../lab-hub-api/src/lib/storage.ts';
import type { SupervisorClient } from '../../../lab-hub-api/src/lib/supervisor-client.ts';
import { hubCaseSchema } from '../../../lab-hub-api/src/modules/clinic/clinic.routes.ts';
import { createApp } from '../../src/app.ts';
import { db } from '../../src/db/client.ts';
import { signAccess } from '../../src/lib/jwt.ts';
import { labHubClient } from '../../src/lib/lab-hub/client.ts';
import { toHubCase } from '../../src/lib/lab-hub/mapper.ts';
import { bookHubConfirmedPrice } from '../../src/lib/lab-hub/price.ts';
import { hubKeyOf } from '../../src/lib/lab-hub/state.ts';
import { flushLabHubOutbox, pollLabHubChanges } from '../../src/lib/lab-hub/sync.ts';
import { createLocalStorageAdapter } from '../../src/lib/storage.ts';
import { grantTenantWide } from './_grant-scope.ts';

// ─── Hub (haqiqiy ilova, o'z bazasi) ─────────────────────────────────────────
const parseEnv = (path: string): Record<string, string> =>
  Object.fromEntries(
    readFileSync(path, 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#') && l.includes('='))
      .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
  );
// Hub kaliti `encryptSecret` bilan saqlanadi — test uchun vaqtinchalik fayl kaliti
// (`MESSAGING_SECRET` env'da yo'q bo'lsa `getSecretPath()` shu yo'lni o'qiydi).
const secretDir = mkdtempSync(join(tmpdir(), 'lab-hub-sync-secret-'));
process.env.MESSAGING_SECRET_PATH ??= join(secretDir, 'messaging-secret.txt');

const hubEnv = parseEnv(join(import.meta.dir, '../../../lab-hub-api/.env'));
const hubUploads = mkdtempSync(join(tmpdir(), 'lab-hub-sync-'));
const hubConfig = loadHubConfig({
  ...hubEnv,
  UPLOADS_DIR: hubUploads,
  SAAS_HUB_TOKEN: hubEnv.SAAS_HUB_TOKEN || 'clinic-sync-saas-hub-token-0123456789abcdef',
});
const hubDb = createHubDb(hubConfig.databaseUrl, 5);
const hubAdmin = postgres(hubEnv.DATABASE_ADMIN_URL as string, { max: 2, onnotice: () => {} });

type Registry = { name: string; expiresAt: string };
const supervisorRegistry = new Map<string, Registry>();
const fakeSupervisor: SupervisorClient = {
  async verifyClinic(id) {
    const c = supervisorRegistry.get(id);
    if (!c) return null;
    return {
      clinicId: id,
      name: c.name,
      mode: 'saas',
      active: true,
      expiresAt: c.expiresAt,
      licenseMatches: false,
    };
  },
};
const hubApp = createHubApp({
  db: hubDb.db,
  config: hubConfig,
  keyring: createKeyring(hubConfig.kek),
  storage: createStorage(hubUploads),
  supervisor: fakeSupervisor,
  now: () => new Date(),
});
const hubServer = Bun.serve({ port: 0, fetch: hubApp.fetch });
const HUB_URL = `http://127.0.0.1:${hubServer.port}`;
const DEAD_URL = 'http://127.0.0.1:1';

const hubJson = (path: string, init: { method?: string; token?: string; body?: unknown } = {}) =>
  hubApp.request(path, {
    method: init.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      'x-real-ip': crypto.randomUUID(),
      ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });

/** Supervisor → Hub: lab + lead; lead parolni almashtiradi → lab JWT. */
const createHubLab = async () => {
  const phone = `+99890${String(Math.floor(Math.random() * 8_999_999) + 1_000_000)}`;
  const res = await hubJson('/internal/labs', {
    method: 'POST',
    token: hubConfig.supervisorHubToken,
    body: {
      name: `Oq Tish Lab ${crypto.randomUUID().slice(0, 6)}`,
      city: 'Toshkent',
      catalogVisible: true,
      expiresAt: new Date(Date.now() + 365 * 86_400_000).toISOString(),
      leadFullName: 'Lab Rahbari',
      leadPhone: phone,
    },
  });
  if (res.status !== 201) throw new Error(`createHubLab ${res.status} ${await res.text()}`);
  const body = (await res.json()) as {
    lab: { id: string; name: string };
    lead: { tempPassword: string };
  };
  const login = await hubJson('/v1/lab/auth/login', {
    method: 'POST',
    body: { phone, password: body.lead.tempPassword },
  });
  const { token: tmp } = (await login.json()) as { token: string };
  const ch = await hubJson('/v1/lab/auth/change-password', {
    method: 'POST',
    token: tmp,
    body: { currentPassword: body.lead.tempPassword, newPassword: `Lab-parol-${Date.now()}` },
  });
  const { token } = (await ch.json()) as { token: string };
  return { labId: body.lab.id, labName: body.lab.name, token };
};

const hubCaseByRef = async (ref: string) =>
  (await hubAdmin`SELECT id, status, approved_price, proposed_price FROM cases WHERE clinic_case_ref = ${ref}`) as unknown as {
    id: string;
    status: string;
    approved_price: string | null;
    proposed_price: string | null;
  }[];

// ─── Klinika ────────────────────────────────────────────────────────────────
const app = createApp();
const PHONE = '+998901234567';
const ADDRESS = 'Chilonzor 9-kvartal 15-uy';
const PASSPORT = 'AA1234567';

let tenantId: string;
let userId: string;
let patientId: string;
let lab: Awaited<ReturnType<typeof createHubLab>>;

const permsOf = (key: string) => {
  const tpl = ROLE_TEMPLATES.find((r) => r.templateKey === key);
  if (!tpl) throw new Error(`template ${key}`);
  return [...tpl.permissions];
};
const tokenFor = async (perms: string[]) =>
  (
    await signAccess({
      sub: userId,
      atid: tenantId,
      abid: null,
      perms,
      roleKey: null,
      lang: 'uz',
    })
  ).token;

const call = async (role: string, method: string, path: string, body?: unknown) =>
  app.request(path, {
    method,
    headers: {
      Authorization: `Bearer ${await tokenFor(permsOf(role))}`,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const inTenant = <T>(fn: (tx: typeof db) => Promise<T>) =>
  db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`);
    return fn(tx as unknown as typeof db);
  });

const createOrder = async () => {
  const res = await call('doctor', 'POST', '/api/lab-orders', {
    patientId,
    doctorId: userId,
    labName: 'Vaqtinchalik',
    orderType: 'crown',
    items: [{ description: 'Toj 11, 21', toothNumbers: [11, 21], material: 'Zirkoniy' }],
    shade: 'A2',
    dueDate: '2026-12-01',
    notes: 'Bemorning tishlari sezgir',
  });
  expect(res.status).toBe(201);
  return ((await res.json()) as { data: { id: string } }).data.id;
};

const orderRow = async (id: string) =>
  inTenant(async (tx) => (await tx.select().from(labOrders).where(eq(labOrders.id, id)))[0]);

/** Klinikaning Hub kaliti (deshifrlangan) — Hub'ga to'g'ridan-to'g'ri «klinika» sifatida murojaat. */
const clinicHubKey = async () => {
  const [state] = await inTenant((tx) => tx.select().from(labHubState));
  const key = hubKeyOf(state);
  if (!key) throw new Error('not connected');
  return key;
};

const expensesOf = (id: string) =>
  inTenant((tx) => tx.select().from(expenses).where(eq(expenses.labOrderId, id)));

/** Hub o'chiq paytida chaqiriladi — commit'dan keyingi kick yiqiladi, op navbatda qoladi. */
const whileHubDown = async <T>(fn: () => Promise<T>): Promise<T> => {
  process.env.LAB_HUB_URL = DEAD_URL;
  try {
    return await fn();
  } finally {
    process.env.LAB_HUB_URL = HUB_URL;
  }
};

/** Outbox qatorlarini darhol urinishga tayyorlaydi (backoff kutmasdan). */
const releaseOutbox = () =>
  inTenant((tx) =>
    tx
      .update(labHubOutbox)
      .set({ nextAttemptAt: new Date(Date.now() - 1000) })
      .where(eq(labHubOutbox.status, 'pending')),
  );

const saved = {
  url: process.env.LAB_HUB_URL,
  token: process.env.LAB_HUB_SERVICE_TOKEN,
  desktop: process.env.DENTAL_LOCAL_DESKTOP,
};
const restore = (k: string, v: string | undefined) => {
  if (v === undefined) delete process.env[k];
  else process.env[k] = v;
};

beforeAll(async () => {
  delete process.env.DENTAL_LOCAL_DESKTOP;
  process.env.LAB_HUB_URL = HUB_URL;
  process.env.LAB_HUB_SERVICE_TOKEN = hubConfig.saasHubToken as string;

  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const [u] = await db
    .insert(users)
    .values({ phone: '+998900007711', passwordHash: 'x', fullName: 'Dr. Aliyev Bekzod' })
    .returning({ id: users.id });
  userId = u!.id;
  const [t] = await db
    .insert(tenants)
    .values({ name: 'Hub Klinika', slug: `hub-klinika-${Date.now()}`, ownerUserId: userId })
    .returning({ id: tenants.id });
  tenantId = t!.id;

  const supervisorClinicId = crypto.randomUUID();
  supervisorRegistry.set(supervisorClinicId, {
    name: 'Hub Klinika',
    expiresAt: new Date(Date.now() + 365 * 86_400_000).toISOString(),
  });
  await inTenant(async (tx) => {
    await tx.insert(tenantSettings).values({ tenantId, supervisorClinicId });
    const [p] = await tx
      .insert(patients)
      .values({
        tenantId,
        fullName: 'Karimova Dilnoza Rustamovna',
        gender: 'female',
        dateOfBirth: '1990-03-15',
        phone: PHONE,
        address: ADDRESS,
        passport: PASSPORT,
      })
      .returning({ id: patients.id });
    patientId = p!.id;
    // X-2 / FX-106: filial doirasi JWT emas, tayinlov → rol permission'laridan o'qiladi
    // (xarajat va h.k.). Testlar shu foydalanuvchi bilan turli shablon permset'li token
    // ishlatadi — doira uchun barcha shablon kodlari bilan tenant-wide tayinlov.
    const allTemplatePerms = [...new Set(ROLE_TEMPLATES.flatMap((r) => [...r.permissions]))];
    await grantTenantWide(tx, tenantId, userId, allTemplatePerms, 'Hub test roli');
  });

  lab = await createHubLab();
});

afterAll(async () => {
  restore('LAB_HUB_URL', saved.url);
  restore('LAB_HUB_SERVICE_TOKEN', saved.token);
  restore('DENTAL_LOCAL_DESKTOP', saved.desktop);
  hubServer.stop(true);
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  await hubDb.client.end({ timeout: 5 });
  await hubAdmin.end({ timeout: 5 });
  rmSync(hubUploads, { recursive: true, force: true });
  rmSync(secretDir, { recursive: true, force: true });
});

// ─── PHI mapper (L3) ────────────────────────────────────────────────────────
describe('toHubCase — PHI chegarasi', () => {
  test('faqat L3 maydonlari; telefon/manzil/pasport yo‘q; Hub strict sxemasi qabul qiladi', () => {
    const payload = toHubCase({
      labId: lab.labId,
      order: {
        id: crypto.randomUUID(),
        orderNumber: 7,
        orderType: 'bridge',
        items: [{ description: "Ko'prik 34–36", toothNumbers: [34, 35, 36], material: 'Zirkoniy' }],
        shade: 'A3',
        dueDate: '2026-12-01',
        notes: 'Izoh',
      },
      patient: {
        fullName: 'Karimova Dilnoza Rustamovna',
        gender: 'female',
        dateOfBirth: '1990-03-15',
        // Mapper'ga ataylab to'liq bemor qatori beriladi — PII baribir o'tmasligi kerak.
        phone: PHONE,
        phoneSecondary: '+998977777777',
        address: ADDRESS,
        passport: PASSPORT,
        cardNumber: 'K-0001',
      } as never,
      doctorName: 'Dr. Aliyev',
      now: new Date('2026-11-12T10:00:00Z'),
    });
    const wire = JSON.stringify(payload);
    for (const secret of [PHONE, '+998977777777', ADDRESS, PASSPORT, 'K-0001']) {
      expect(wire).not.toContain(secret);
    }
    expect(Object.keys(payload).sort()).toEqual(
      [
        'labId',
        'patient',
        'clinicCode',
        'doctorName',
        'teeth',
        'workType',
        'material',
        'shade',
        'dueDate',
        'note',
      ].sort(),
    );
    expect(Object.keys(payload.patient).sort()).toEqual(['age', 'fullName', 'sex']);
    // L3: TO'LIQ ism (initsiallar emas).
    expect(payload.patient.fullName).toBe('Karimova Dilnoza Rustamovna');
    expect(payload.patient.age).toBe(36);
    expect(payload.teeth).toEqual([34, 35, 36]);
    expect(hubCaseSchema.safeParse(payload).success).toBe(true);
  });
});

// ─── Ulanish va katalog ──────────────────────────────────────────────────────
describe('ulanish, katalog, ulanish so‘rovi', () => {
  test('Doctor ulana olmaydi (403); Tenant Admin ulanadi', async () => {
    expect((await call('doctor', 'POST', '/api/lab-hub/connect')).status).toBe(403);
    const res = await call('tenant_admin', 'POST', '/api/lab-hub/connect');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { connected: boolean; hubClinicId: string } };
    expect(body.data.connected).toBe(true);
    const [state] = await inTenant((tx) => tx.select().from(labHubState));
    expect(state?.hubClinicId).toBe(body.data.hubClinicId);
    // Hub kaliti ochiq saqlanmaydi (Qaror #38 naqshi — iv:tag:ct).
    expect(state?.hubKeyEnc?.split(':')).toHaveLength(3);
    expect(state?.hubKeyEnc).not.toMatch(/^hk_/);
  });

  test('katalog → so‘rov → lab tasdiqlaydi → faol', async () => {
    const list = await call('doctor', 'GET', '/api/lab-hub/labs');
    expect(list.status).toBe(200);
    const labs = ((await list.json()) as { data: { labs: { id: string; linkStatus: string }[] } })
      .data.labs;
    expect(labs.find((l) => l.id === lab.labId)?.linkStatus ?? null).toBeNull();

    expect((await call('doctor', 'POST', '/api/lab-hub/links', { labId: lab.labId })).status).toBe(
      403,
    );
    const req = await call('tenant_admin', 'POST', '/api/lab-hub/links', { labId: lab.labId });
    expect(req.status).toBe(200);
    const linkId = ((await req.json()) as { data: { link: { id: string; status: string } } }).data
      .link.id;
    const d = await hubJson(`/v1/lab/links/${linkId}/decision`, {
      method: 'POST',
      token: lab.token,
      body: { decision: 'approve' },
    });
    expect(d.status).toBe(200);

    const again = await call('doctor', 'GET', '/api/lab-hub/labs');
    const labs2 = ((await again.json()) as { data: { labs: { id: string; linkStatus: string }[] } })
      .data.labs;
    expect(labs2.find((l) => l.id === lab.labId)?.linkStatus).toBe('active');
  });
});

// ─── Offline navbat, dublikatsiz push ───────────────────────────────────────
describe('outbox — internetsiz navbat, qaytganda bir marta', () => {
  let orderId: string;
  const sentBodies: string[] = [];
  const recordingFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof init?.body === 'string') sentBodies.push(init.body);
    return fetch(input, init);
  }) as typeof fetch;

  test('Hub o‘chiq: yuborish 200, ish navbatda qoladi', async () => {
    orderId = await createOrder();
    process.env.LAB_HUB_URL = DEAD_URL;
    const res = await call('doctor', 'POST', `/api/lab-orders/${orderId}/send-to-hub`, {
      labId: lab.labId,
    });
    expect(res.status).toBe(200);
    const dto = ((await res.json()) as { data: { status: string; hubSyncStatus: string } }).data;
    expect(dto.status).toBe('sent');
    expect(dto.hubSyncStatus).toBe('pending');

    await releaseOutbox();
    const r = await flushLabHubOutbox(tenantId, { fetchImpl: recordingFetch });
    expect(r.sent).toBe(0);
    expect(r.retry).toBeGreaterThan(0);
    const [row] = await inTenant((tx) =>
      tx.select().from(labHubOutbox).where(eq(labHubOutbox.labOrderId, orderId)),
    );
    expect(row?.status).toBe('pending');
    // 1-urinish — commit'dan keyingi kick (onAfterCommit), 2-si — shu flush.
    expect(row?.attempts).toBe(2);
    expect(row?.lastError).toBe('lab_hub.unreachable');
    expect(row!.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
    expect(await hubCaseByRef(orderId)).toHaveLength(0);
  });

  test('Hub qaytdi: bir marta ketadi; qayta yuborish dublikat yaratmaydi', async () => {
    process.env.LAB_HUB_URL = HUB_URL;
    await releaseOutbox();
    const r = await flushLabHubOutbox(tenantId, { fetchImpl: recordingFetch });
    expect(r.sent).toBeGreaterThan(0);
    expect(await hubCaseByRef(orderId)).toHaveLength(1);
    expect((await orderRow(orderId))?.hubSyncStatus).toBe('synced');

    // Javob yo'qolgan holat: xuddi shu op qayta yuboriladi → Hub'da baribir bitta ish.
    await inTenant((tx) =>
      tx
        .update(labHubOutbox)
        .set({ status: 'pending', doneAt: null, nextAttemptAt: new Date(Date.now() - 1000) })
        .where(and(eq(labHubOutbox.labOrderId, orderId), eq(labHubOutbox.op, 'upsert_case'))),
    );
    await flushLabHubOutbox(tenantId, { fetchImpl: recordingFetch });
    expect(await hubCaseByRef(orderId)).toHaveLength(1);

    // Simdagi haqiqiy PUT tanalari: ism bor, PII yo'q.
    const puts = sentBodies.filter((b) => b.includes('"workType"'));
    expect(puts.length).toBeGreaterThan(0);
    for (const b of puts) {
      expect(b).toContain('Karimova Dilnoza Rustamovna');
      for (const secret of [PHONE, ADDRESS, PASSPORT]) expect(b).not.toContain(secret);
    }
  });

  test('ikkinchi yuborish (allaqachon Hub’da) 409', async () => {
    const res = await call('doctor', 'POST', `/api/lab-orders/${orderId}/send-to-hub`, {
      labId: lab.labId,
    });
    expect(res.status).toBe(409);
  });

  // ─── Poll (Hub → klinika) ──────────────────────────────────────────────────
  test('poll: holat/narx/xabar buyurtmaga tushadi; qayta o‘qishda dublikat yo‘q', async () => {
    const [hc] = await hubCaseByRef(orderId);
    const step = async (path: string, body: unknown) => {
      const r = await hubJson(`/v1/lab/cases/${hc!.id}${path}`, {
        method: 'POST',
        token: lab.token,
        body,
      });
      expect(r.status).toBeLessThan(300);
    };
    await step('/status', { to: 'accepted' });
    await step('/status', { to: 'in_progress' });
    await step('/messages', { body: 'Rang A2 tasdiqlandimi?' });
    await step('/price', { price: 350000 });
    await step('/status', { to: 'ready' });

    await pollLabHubChanges(tenantId);
    const row = await orderRow(orderId);
    expect(row?.status).toBe('ready');
    expect(row?.hubStatus).toBe('ready');
    expect(row?.proposedPrice).toBe('350000.00');
    const msgs = await inTenant((tx) =>
      tx.select().from(labOrderMessages).where(eq(labOrderMessages.labOrderId, orderId)),
    );
    expect(msgs.filter((m) => m.author === 'lab').map((m) => m.body)).toEqual([
      'Rang A2 tasdiqlandimi?',
    ]);
    const notifCount = async () =>
      (await inTenant((tx) => tx.select().from(notifications))).filter((n) =>
        n.type.startsWith('lab_hub.'),
      ).length;
    const before = await notifCount();
    expect(before).toBeGreaterThan(0);

    // Kursor boshiga qaytariladi (sahifa qayta keldi) — hech narsa ikki marta qo'llanmaydi.
    await inTenant((tx) => tx.update(labHubState).set({ cursor: '0.0' }));
    await pollLabHubChanges(tenantId);
    expect(await notifCount()).toBe(before);
    const msgs2 = await inTenant((tx) =>
      tx.select().from(labOrderMessages).where(eq(labOrderMessages.labOrderId, orderId)),
    );
    expect(msgs2).toHaveLength(msgs.length);
  });

  // ─── Narx tasdig'i (L4) ────────────────────────────────────────────────────
  test('Technician / Nurse / Receptionist tasdiqlay olmaydi (403) — lab_order.approve_price', async () => {
    for (const role of ['technician', 'nurse', 'receptionist']) {
      const res = await call(role, 'POST', `/api/lab-orders/${orderId}/approve-price`, {
        price: '350000.00',
      });
      expect(res.status).toBe(403);
    }
    expect(await expensesOf(orderId)).toHaveLength(0);
  });

  test('tasdiq → kutilmoqda (xarajat YO‘Q); Hub 2xx → aynan bitta expense', async () => {
    const approve = (price: unknown) =>
      call('doctor', 'POST', `/api/lab-orders/${orderId}/approve-price`, { price });
    // Hub o'chiq — tasdiq faqat navbatda: xarajat yozilmaydi.
    const [a, b] = await whileHubDown(() =>
      Promise.all([approve('350000.00'), approve('350000.00')]),
    );
    expect([a.status, b.status].sort()).toEqual([200, 200]);
    const ra = ((await a.json()) as { data: { status: string; expenseId: string | null } }).data;
    expect(ra.status).toBe('pending');
    expect(ra.expenseId).toBeNull();
    expect(await expensesOf(orderId)).toHaveLength(0);
    const pendingRow = await orderRow(orderId);
    expect(pendingRow?.approvedPrice).toBeNull();
    expect(pendingRow?.priceApprovalRequestedPrice).toBe('350000.00');
    expect(pendingRow?.cost).toBeNull();
    const dto = await call('doctor', 'GET', `/api/lab-orders/${orderId}`);
    expect(
      ((await dto.json()) as { data: { priceApprovalPending: boolean } }).data.priceApprovalPending,
    ).toBe(true);
    // Parallel ikki bosish — bitta op.
    const ops = await inTenant((tx) =>
      tx
        .select()
        .from(labHubOutbox)
        .where(and(eq(labHubOutbox.labOrderId, orderId), eq(labHubOutbox.op, 'approve_price'))),
    );
    expect(ops).toHaveLength(1);

    // Hub qaytdi — push 2xx → xarajat.
    await releaseOutbox();
    await flushLabHubOutbox(tenantId);
    const rows = await expensesOf(orderId);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.amount).toBe('350000.00');
    expect(rows[0]?.createdBy).toBe(userId);
    const row = await orderRow(orderId);
    expect(row?.approvedPrice).toBe('350000.00');
    expect(row?.cost).toBe('350000.00');
    expect(row?.priceApprovalRequestedAt).toBeNull();
    expect((await hubCaseByRef(orderId))[0]?.approved_price).toBe('350000.00');

    // Poll Hub'ning `price_approved` hodisasini olib keladi — ikkinchi xarajat YO'Q.
    await pollLabHubChanges(tenantId);
    expect(await expensesOf(orderId)).toHaveLength(1);

    const third = await approve(350000);
    expect(third.status).toBe(200);
    const t3 = ((await third.json()) as { data: { alreadyApproved: boolean; status: string } })
      .data;
    expect(t3).toMatchObject({ alreadyApproved: true, status: 'approved' });
    // Tasdiqlangandan keyin boshqa summa — 409, yangi xarajat yo'q.
    const other = await approve('400000.00');
    expect(other.status).toBe(409);
    expect(((await other.json()) as { error: { code: string } }).error.code).toBe(
      'price.already_approved',
    );
    expect(await expensesOf(orderId)).toHaveLength(1);
  });

  test('klinika «yetkazildi» faqat Hub `ready`da; lab qabul qilgach tahrir 409', async () => {
    const id = await createOrder();
    expect(
      (await call('doctor', 'POST', `/api/lab-orders/${id}/send-to-hub`, { labId: lab.labId }))
        .status,
    ).toBe(200);
    await releaseOutbox();
    await flushLabHubOutbox(tenantId);
    // Lab hali qabul qilmagan (`sent`) — tahrir mumkin va Hub'ga qayta push qilinadi.
    const edit = await call('doctor', 'PATCH', `/api/lab-orders/${id}`, { shade: 'A3' });
    expect(edit.status).toBe(200);
    const [hc] = await hubCaseByRef(id);
    const r = await hubJson(`/v1/lab/cases/${hc!.id}/status`, {
      method: 'POST',
      token: lab.token,
      body: { to: 'accepted' },
    });
    expect(r.status).toBe(200);
    await pollLabHubChanges(tenantId);
    expect((await orderRow(id))?.hubStatus).toBe('accepted');
    const opsBefore = (
      await inTenant((tx) => tx.select().from(labHubOutbox).where(eq(labHubOutbox.labOrderId, id)))
    ).length;

    const delivered = await call('doctor', 'PATCH', `/api/lab-orders/${id}`, {
      status: 'delivered',
    });
    expect(delivered.status).toBe(400);
    expect(((await delivered.json()) as { error: { code: string } }).error.code).toBe(
      'lab_hub.not_ready',
    );
    const locked = await call('doctor', 'PATCH', `/api/lab-orders/${id}`, { shade: 'B1' });
    expect(locked.status).toBe(409);
    const lb = (await locked.json()) as { error: { code: string; message: string } };
    expect(lb.error.code).toBe('lab_order.locked_by_lab');
    expect(lb.error.message).toContain('xabar');
    for (const body of [{ notes: 'boshqa' }, { dueDate: '2026-12-20' }]) {
      expect((await call('doctor', 'PATCH', `/api/lab-orders/${id}`, body)).status).toBe(409);
    }
    const after = await orderRow(id);
    expect(after?.shade).toBe('A3');
    expect(after?.status).toBe('sent');
    const opsAfter = (
      await inTenant((tx) => tx.select().from(labHubOutbox).where(eq(labHubOutbox.labOrderId, id)))
    ).length;
    expect(opsAfter).toBe(opsBefore);
    // Qiymat o'zgarmagan maydon (forma hammasini qayta yuboradi) — bloklanmaydi.
    expect((await call('doctor', 'PATCH', `/api/lab-orders/${id}`, { shade: 'A3' })).status).toBe(
      200,
    );
  });

  test('klinika xabari Hub’ga bir marta ketadi; poll uni lokal dublikat qilmaydi', async () => {
    const res = await call('doctor', 'POST', `/api/lab-orders/${orderId}/hub-messages`, {
      body: 'Ha, A2.',
    });
    expect(res.status).toBe(201);
    await releaseOutbox();
    await flushLabHubOutbox(tenantId);
    await pollLabHubChanges(tenantId);
    const [hc] = await hubCaseByRef(orderId);
    const hubMsgs =
      (await hubAdmin`SELECT author FROM case_messages WHERE case_id = ${hc!.id}`) as unknown as {
        author: string;
      }[];
    expect(hubMsgs.filter((m) => m.author === 'clinic')).toHaveLength(1);

    // Javob yo'qolgan holat: xuddi shu op qayta yuboriladi → `clientRef` → Hub'da baribir bitta.
    await inTenant((tx) =>
      tx
        .update(labHubOutbox)
        .set({ status: 'pending', doneAt: null, nextAttemptAt: new Date(Date.now() - 1000) })
        .where(and(eq(labHubOutbox.labOrderId, orderId), eq(labHubOutbox.op, 'message'))),
    );
    const again = await flushLabHubOutbox(tenantId);
    expect(again.sent).toBeGreaterThan(0);
    const hubMsgs2 =
      (await hubAdmin`SELECT author FROM case_messages WHERE case_id = ${hc!.id}`) as unknown as {
        author: string;
      }[];
    expect(hubMsgs2.filter((m) => m.author === 'clinic')).toHaveLength(1);

    const list = await call('nurse', 'GET', `/api/lab-orders/${orderId}/hub-messages`);
    expect(list.status).toBe(200);
    const data = ((await list.json()) as { data: { author: string; body: string }[] }).data;
    expect(data.filter((m) => m.author === 'clinic').map((m) => m.body)).toEqual(['Ha, A2.']);
  });

  test('klinika «yetkazildi» → Hub delivered', async () => {
    const res = await call('doctor', 'PATCH', `/api/lab-orders/${orderId}`, {
      status: 'delivered',
    });
    expect(res.status).toBe(200);
    await releaseOutbox();
    await flushLabHubOutbox(tenantId);
    expect((await hubCaseByRef(orderId))[0]?.status).toBe('delivered');
  });

  test('remake: lab qabul qilsa klinika buyurtmasi qayta «jarayonda»', async () => {
    expect((await orderRow(orderId))?.status).toBe('delivered');
    const key = await clinicHubKey();
    const rm = await hubJson(`/v1/clinic/cases/${orderId}/remake`, {
      method: 'POST',
      token: key,
      body: { reason: 'Rang mos emas' },
    });
    expect(rm.status).toBe(200);
    await pollLabHubChanges(tenantId);
    // Hali lab qabul qilmagan — klinika holati o'zgarmaydi.
    expect((await orderRow(orderId))?.status).toBe('delivered');
    expect((await orderRow(orderId))?.hubStatus).toBe('remake');

    const [hc] = await hubCaseByRef(orderId);
    const acc = await hubJson(`/v1/lab/cases/${hc!.id}/status`, {
      method: 'POST',
      token: lab.token,
      body: { to: 'accepted' },
    });
    expect(acc.status).toBe(200);
    await pollLabHubChanges(tenantId);
    const row = await orderRow(orderId);
    expect(row?.status).toBe('in_progress');
    expect(row?.hubStatus).toBe('accepted');
    expect(row?.deliveredDate).toBeNull();
    // Narx tasdig'i/xarajat remake'da tegilmaydi.
    expect(await expensesOf(orderId)).toHaveLength(1);
  });

  test('lab fayli klinikaga yetadi: proxy (lab_order.view) — Receptionist 403', async () => {
    const [hc] = await hubCaseByRef(orderId);
    const form = new FormData();
    form.append(
      'file',
      new File([Buffer.from('LAB-RESULT-PDF')], 'natija.pdf', { type: 'application/pdf' }),
    );
    const up = await hubApp.request(`/v1/lab/cases/${hc!.id}/files`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${lab.token}` },
      body: form,
    });
    expect(up.status).toBe(201);
    const { file } = (await up.json()) as { file: { id: string } };
    await pollLabHubChanges(tenantId);
    const list = await call('nurse', 'GET', `/api/lab-orders/${orderId}/hub-messages`);
    const msgs = ((await list.json()) as { data: { kind: string; file: { id: string } | null }[] })
      .data;
    expect(msgs.find((m) => m.kind === 'file')?.file?.id).toBe(file.id);

    const path = `/api/lab-orders/${orderId}/hub-files/${file.id}`;
    const res = await call('nurse', 'GET', path);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('cache-control')).toContain('no-store');
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe('LAB-RESULT-PDF');
    expect((await call('receptionist', 'GET', path)).status).toBe(403);
    // Shu buyurtmaga sinxron orqali kelmagan fayl id'si — 404.
    expect(
      (await call('nurse', 'GET', `/api/lab-orders/${orderId}/hub-files/${crypto.randomUUID()}`))
        .status,
    ).toBe(404);
    const audits = await inTenant((tx) =>
      tx
        .select()
        .from(auditLog)
        .where(and(eq(auditLog.resourceId, orderId), eq(auditLog.action, 'viewed'))),
    );
    expect(
      audits.some((a) => (a.after as { hubFileId?: string } | null)?.hubFileId === file.id),
    ).toBe(true);
  });
});

// ─── Lab narxni qayta taklif qiladi (pul: TOCTOU + Hub price.mismatch) ───────
describe('narx qayta taklifi — klinika kitoblari Hub bilan mos qoladi', () => {
  const sendCase = async () => {
    const id = await createOrder();
    const res = await call('doctor', 'POST', `/api/lab-orders/${id}/send-to-hub`, {
      labId: lab.labId,
    });
    expect(res.status).toBe(200);
    await releaseOutbox();
    await flushLabHubOutbox(tenantId);
    const [hc] = await hubCaseByRef(id);
    const step = async (path: string, body: unknown) => {
      const r = await hubJson(`/v1/lab/cases/${hc!.id}${path}`, {
        method: 'POST',
        token: lab.token,
        body,
      });
      expect(r.status).toBeLessThan(300);
    };
    await step('/status', { to: 'accepted' });
    return { id, step };
  };
  const approve = (id: string, price: unknown, role = 'doctor') =>
    call(role, 'POST', `/api/lab-orders/${id}/approve-price`, { price });

  test('narxsiz so‘rov 400, xarajat yo‘q', async () => {
    const { id, step } = await sendCase();
    await step('/price', { price: 100000 });
    await pollLabHubChanges(tenantId);
    const res = await call('doctor', 'POST', `/api/lab-orders/${id}/approve-price`, {});
    expect(res.status).toBe(400);
    expect(await expensesOf(id)).toHaveLength(0);
    expect((await orderRow(id))?.priceApprovalRequestedAt).toBeNull();
  });

  test('TOCTOU: ekranda 100000, poll 300000 ni olib keldi → 409 price.changed, hech narsa yozilmaydi', async () => {
    const { id, step } = await sendCase();
    await step('/price', { price: 100000 });
    await pollLabHubChanges(tenantId);
    const shown = (await orderRow(id))?.proposedPrice;
    expect(shown).toBe('100000.00');
    await step('/price', { price: 300000 });
    await pollLabHubChanges(tenantId);

    const res = await approve(id, shown);
    expect(res.status).toBe(409);
    const body = (await res.json()) as {
      error: { code: string; details?: { proposedPrice?: string } };
    };
    expect(body.error.code).toBe('price.changed');
    expect(body.error.details?.proposedPrice).toBe('300000.00');
    expect(await expensesOf(id)).toHaveLength(0);
    const row = await orderRow(id);
    expect(row?.approvedPrice).toBeNull();
    expect(row?.priceApprovalRequestedAt).toBeNull();
    const ops = await inTenant((tx) =>
      tx
        .select()
        .from(labHubOutbox)
        .where(and(eq(labHubOutbox.labOrderId, id), eq(labHubOutbox.op, 'approve_price'))),
    );
    expect(ops).toHaveLength(0);

    // Yangi narx ko'rilib tasdiqlanadi → bitta xarajat. Accountant'da ruxsat yo'q (klinik ruxsat berilmaydi).
    expect((await approve(id, '300000.00', 'accountant')).status).toBe(403);
    expect((await approve(id, '300000.00')).status).toBe(200);
    await releaseOutbox();
    await flushLabHubOutbox(tenantId);
    expect((await expensesOf(id)).map((e) => e.amount)).toEqual(['300000.00']);
    expect((await hubCaseByRef(id))[0]?.approved_price).toBe('300000.00');
  });

  test('Hub price.mismatch: kutish tozalanadi, xarajat umuman yozilmagan, yangi taklif ko‘rinadi', async () => {
    const { id, step } = await sendCase();
    await step('/price', { price: 100000 });
    await pollLabHubChanges(tenantId);
    await step('/price', { price: 300000 }); // lab tuzatdi, klinika hali poll qilmagan

    // Hub vaqtincha yetib bo'lmaydi — tasdiq navbatda (commit'dan keyingi kick yiqiladi).
    const res = await whileHubDown(() => approve(id, '100000.00'));
    expect(res.status).toBe(200);
    expect(((await res.json()) as { data: { status: string } }).data.status).toBe('pending');
    expect(await expensesOf(id)).toHaveLength(0);
    expect((await orderRow(id))?.approvedPrice).toBeNull();

    // Poll kutish turganida ham Hub'dagi yangi taklifni oladi (tashlanmaydi), kutish saqlanadi.
    await pollLabHubChanges(tenantId);
    const mid = await orderRow(id);
    expect(mid?.proposedPrice).toBe('300000.00');
    expect(mid?.priceApprovalRequestedPrice).toBe('100000.00');
    // Kutish hal bo'lmaguncha boshqa narxni tasdiqlab bo'lmaydi.
    const busy = await approve(id, '300000.00');
    expect(busy.status).toBe(409);
    expect(((await busy.json()) as { error: { code: string } }).error.code).toBe(
      'price.approval_pending',
    );

    const notifsBefore = (
      await inTenant((tx) =>
        tx.select().from(notifications).where(eq(notifications.type, 'lab_hub.price')),
      )
    ).length;
    // Push: Hub 409 price.mismatch → kutish tozalanadi.
    await releaseOutbox();
    await flushLabHubOutbox(tenantId);
    const row = await orderRow(id);
    expect(row?.approvedPrice).toBeNull();
    expect(row?.approvedAt).toBeNull();
    expect(row?.cost).toBeNull();
    expect(row?.priceApprovalRequestedAt).toBeNull();
    expect(row?.priceApprovalRequestedPrice).toBeNull();
    expect(row?.proposedPrice).toBe('300000.00');
    expect(row?.hubSyncStatus).toBe('synced');
    expect(await expensesOf(id)).toHaveLength(0);
    const ob = await inTenant((tx) =>
      tx
        .select()
        .from(labHubOutbox)
        .where(and(eq(labHubOutbox.labOrderId, id), eq(labHubOutbox.op, 'approve_price'))),
    );
    expect(ob.map((o) => [o.status, o.lastError])).toEqual([['rejected', 'price.mismatch']]);
    const audits = await inTenant((tx) =>
      tx
        .select()
        .from(auditLog)
        .where(and(eq(auditLog.resourceId, id), eq(auditLog.action, 'price_approval_rejected'))),
    );
    expect(audits).toHaveLength(1);
    const notifs = await inTenant((tx) =>
      tx.select().from(notifications).where(eq(notifications.type, 'lab_hub.price')),
    );
    expect(notifs.length).toBeGreaterThan(notifsBefore);
    expect(notifs.some((n) => n.title.includes("o'zgartirdi"))).toBe(true);
    const [hc] = await hubCaseByRef(id);
    expect(hc?.approved_price).toBeNull();

    // Eski narx bilan qayta bosish — endi 409, yangi narx bilan — kutilmoqda → Hub → xarajat.
    expect((await approve(id, '100000.00')).status).toBe(409);
    const ok = await whileHubDown(() => approve(id, '300000.00'));
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { data: { status: string } }).data.status).toBe('pending');
    expect(await expensesOf(id)).toHaveLength(0);
    await releaseOutbox();
    await flushLabHubOutbox(tenantId);
    expect((await expensesOf(id)).map((e) => e.amount)).toEqual(['300000.00']);
    expect((await orderRow(id))?.approvedPrice).toBe('300000.00');
    expect((await hubCaseByRef(id))[0]?.approved_price).toBe('300000.00');
  });

  test('javob yo‘qoldi: Hub tasdiqladi, poll birinchi yozadi, keyingi push 2xx — baribir bitta xarajat', async () => {
    const { id, step } = await sendCase();
    await step('/price', { price: 120000 });
    await pollLabHubChanges(tenantId);
    expect((await whileHubDown(() => approve(id, '120000.00'))).status).toBe(200);
    expect(await expensesOf(id)).toHaveLength(0);

    // Hub so'rovni qabul qilgan, lekin javob klinikaga yetmagan (outbox op hali pending).
    const direct = await hubJson(`/v1/clinic/cases/${id}/approve-price`, {
      method: 'POST',
      token: await clinicHubKey(),
      body: { price: 120000 },
    });
    expect(direct.status).toBe(200);
    // Poll `price_approved` hodisasi — xarajat shu yerda.
    await pollLabHubChanges(tenantId);
    expect((await expensesOf(id)).map((e) => e.amount)).toEqual(['120000.00']);
    expect((await orderRow(id))?.approvedPrice).toBe('120000.00');
    expect((await orderRow(id))?.priceApprovalRequestedAt).toBeNull();
    // Navbatdagi op endi yuboriladi → Hub `alreadyApproved` (2xx) → ikkinchi xarajat yo'q.
    await releaseOutbox();
    const r = await flushLabHubOutbox(tenantId);
    expect(r.sent).toBeGreaterThan(0);
    expect(await expensesOf(id)).toHaveLength(1);
    const created = await inTenant((tx) =>
      tx
        .select()
        .from(auditLog)
        .where(and(eq(auditLog.resourceType, 'expense'), eq(auditLog.action, 'created'))),
    );
    const mine = (await expensesOf(id))[0]!.id;
    expect(created.filter((a) => a.resourceId === mine)).toHaveLength(1);
  });
});

describe('narx taklifisiz tasdiq', () => {
  test('409 price.not_proposed, expense yo‘q', async () => {
    const id = await createOrder();
    const res = await call('doctor', 'POST', `/api/lab-orders/${id}/approve-price`, {
      price: '1000.00',
    });
    expect(res.status).toBe(409);
    const rows = await inTenant((tx) =>
      tx.select().from(expenses).where(eq(expenses.labOrderId, id)),
    );
    expect(rows).toHaveLength(0);
  });
});

// ─── Umumiy klaster xmin'i (boshqa lane'lar) Hub hodisasini qisqa ushlab turishi mumkin ──
/** Hub joriy kursordan kamida `min` hodisani bera oladimi — kursorni surmasdan tekshiradi. */
const waitHubEvents = async (min: number) => {
  for (let i = 0; i < 100; i++) {
    const [state] = await inTenant((tx) => tx.select().from(labHubState));
    const res = await labHubClient().changes(await clinicHubKey(), state!.cursor, 200);
    if (res.events.length >= min) return;
    await Bun.sleep(50);
  }
  throw new Error(`Hub did not expose ${min} event(s)`);
};
/** Poll'ni shart bajarilguncha takrorlaydi (hodisa xmin bilan kechiksa ham). */
const pollUntil = async (ok: () => Promise<boolean>) => {
  for (let i = 0; i < 100; i++) {
    await pollLabHubChanges(tenantId);
    if (await ok()) return;
    await Bun.sleep(50);
  }
  throw new Error('poll condition not reached');
};

// ─── FX-139: poll ↔ bekor qilish poygasi ─────────────────────────────────────
describe('FX-139 — poll bekor qilingan buyurtmani qayta tiriltirmaydi', () => {
  test('bekor qilish tranzaksiyasi poll paytida commit qilinsa, status «cancelled» qoladi', async () => {
    const id = await createOrder();
    expect(
      (await call('doctor', 'POST', `/api/lab-orders/${id}/send-to-hub`, { labId: lab.labId }))
        .status,
    ).toBe(200);
    await releaseOutbox();
    await flushLabHubOutbox(tenantId);
    const [hc] = await hubCaseByRef(id);
    const labStatus = async (to: string) => {
      const r = await hubJson(`/v1/lab/cases/${hc!.id}/status`, {
        method: 'POST',
        token: lab.token,
        body: { to },
      });
      expect(r.status).toBe(200);
    };
    await labStatus('accepted');
    await labStatus('in_progress');
    await pollUntil(async () => (await orderRow(id))?.status === 'in_progress');
    // Navbatda BITTA hodisa qoladi — u holatni o'zgartiradigan (`ready`).
    await labStatus('ready');
    await waitHubEvents(1);

    // Parallel «bekor qilish»: qator yangilangan, lekin commit hali bo'lmagan.
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    let cancelStarted!: () => void;
    const started = new Promise<void>((r) => {
      cancelStarted = r;
    });
    const cancelTx = inTenant(async (tx) => {
      await tx
        .update(labOrders)
        .set({ status: 'cancelled', updatedAt: new Date() })
        .where(eq(labOrders.id, id));
      cancelStarted();
      await gate;
    });
    await started;

    const poll = pollLabHubChanges(tenantId);
    // Poll tranzaksiyasi lab_orders qatori qulfida kutayotganini ko'ramiz (deterministik).
    const deadline = Date.now() + 10_000;
    for (;;) {
      const [w] = (await db.execute(
        sql`SELECT count(*)::int AS n FROM pg_stat_activity
             WHERE datname = current_database() AND wait_event_type = 'Lock'`,
      )) as unknown as { n: number }[];
      if ((w?.n ?? 0) > 0) break;
      if (Date.now() > deadline) throw new Error('poll did not block on the lab_orders row lock');
      await Bun.sleep(20);
    }
    release();
    await cancelTx;
    await poll;

    const row = await orderRow(id);
    expect(row?.status).toBe('cancelled');
    expect(row?.hubStatus).toBe('ready');
  });
});

// ─── FX-49: lab qabul qilgan ishga kechikkan tahrir ──────────────────────────
describe('FX-49 — Hub tahrirni qo‘llamasa (applied:false) «synced» emas', () => {
  test('poll kelmasdan lab qabul qildi: tahrir push → failed, hubStatus yangilanadi, keyingi tahrir 409', async () => {
    const id = await createOrder();
    expect(
      (await call('doctor', 'POST', `/api/lab-orders/${id}/send-to-hub`, { labId: lab.labId }))
        .status,
    ).toBe(200);
    await releaseOutbox();
    await flushLabHubOutbox(tenantId);
    expect((await orderRow(id))?.hubSyncStatus).toBe('synced');
    expect((await orderRow(id))?.hubStatus).toBe('sent');

    // Lab qabul qiladi — klinika hali poll qilmagan (lokal hubStatus = 'sent').
    const [hc] = await hubCaseByRef(id);
    const r = await hubJson(`/v1/lab/cases/${hc!.id}/status`, {
      method: 'POST',
      token: lab.token,
      body: { to: 'accepted' },
    });
    expect(r.status).toBe(200);

    // Shifokor rangni o'zgartiradi — lokal tekshiruv o'tadi, upsert_case navbatga tushadi.
    await whileHubDown(async () => {
      const edit = await call('doctor', 'PATCH', `/api/lab-orders/${id}`, { shade: 'B2' });
      expect(edit.status).toBe(200);
    });
    await releaseOutbox();
    await flushLabHubOutbox(tenantId);

    const row = await orderRow(id);
    // Hub eski rang bilan ishlaydi — klinika «sinxronlangan» demasligi kerak.
    expect(row?.hubSyncStatus).not.toBe('synced');
    expect(row?.hubSyncStatus).toBe('failed');
    expect(row?.hubStatus).toBe('accepted');
    const [op] = await inTenant((tx) =>
      tx
        .select()
        .from(labHubOutbox)
        .where(and(eq(labHubOutbox.labOrderId, id), eq(labHubOutbox.status, 'failed'))),
    );
    expect(op?.op).toBe('upsert_case');
    expect(op?.lastError).toBe('lab_order.locked_by_lab');

    // Keyingi tahrir endi lokal bloklanadi — xabar orqali.
    const locked = await call('doctor', 'PATCH', `/api/lab-orders/${id}`, { shade: 'C1' });
    expect(locked.status).toBe(409);
    expect(((await locked.json()) as { error: { code: string } }).error.code).toBe(
      'lab_order.locked_by_lab',
    );
  });
});

// ─── FX-79: diskda yo'q fayl FIFO'ni bloklamaydi ─────────────────────────────
describe('FX-79 — yo‘q fayl (ENOENT) cheksiz qayta urinilmaydi', () => {
  test('file op «failed» (file.missing), keyingi xabar op baribir yuboriladi', async () => {
    const id = await createOrder();
    expect(
      (await call('doctor', 'POST', `/api/lab-orders/${id}/send-to-hub`, { labId: lab.labId }))
        .status,
    ).toBe(200);
    await releaseOutbox();
    await flushLabHubOutbox(tenantId);
    expect((await orderRow(id))?.hubSyncStatus).toBe('synced');

    // Fayl qatori bor, lekin diskdan yo'qolgan (tiklash/qo'lda o'chirish).
    await inTenant(async (tx) => {
      const [f] = await tx
        .insert(labOrderFiles)
        .values({
          tenantId,
          labOrderId: id,
          objectKey: `${tenantId}/lab-orders/${id}/yoq-${crypto.randomUUID()}.pdf`,
          originalFilename: 'yoq.pdf',
          contentType: 'application/pdf',
          sizeBytes: 10,
        })
        .returning({ id: labOrderFiles.id });
      await tx.insert(labHubOutbox).values({
        tenantId,
        labOrderId: id,
        op: 'file',
        payload: { fileId: f!.id },
      });
    });
    // Undan keyin xabar — FIFO bo'yicha fayl op'idan keyin turadi.
    await whileHubDown(async () => {
      const m = await call('doctor', 'POST', `/api/lab-orders/${id}/hub-messages`, {
        body: 'Rangni tekshiring',
      });
      expect(m.status).toBeLessThan(300);
    });

    await releaseOutbox();
    await flushLabHubOutbox(tenantId);
    await releaseOutbox();
    await flushLabHubOutbox(tenantId);

    const ops = await inTenant((tx) =>
      tx.select().from(labHubOutbox).where(eq(labHubOutbox.labOrderId, id)),
    );
    const fileOp = ops.find((o) => o.op === 'file');
    expect(fileOp?.status).toBe('failed');
    expect(fileOp?.lastError).toBe('file.missing');
    expect(ops.find((o) => o.op === 'message')?.status).toBe('done');
    const [msg] = await inTenant((tx) =>
      tx.select().from(labOrderMessages).where(eq(labOrderMessages.labOrderId, id)),
    );
    expect(msg?.syncedAt).not.toBeNull();
  });
});

// ─── FX-48: doimiy xatoda kutish tozalanadi + «failed» op'larni qayta navbatga qo'yish ──
describe('FX-48 — failed outbox: narx kutishi tozalanadi, qayta navbat', () => {
  const sendAccepted = async () => {
    const id = await createOrder();
    expect(
      (await call('doctor', 'POST', `/api/lab-orders/${id}/send-to-hub`, { labId: lab.labId }))
        .status,
    ).toBe(200);
    await releaseOutbox();
    await flushLabHubOutbox(tenantId);
    const [hc] = await hubCaseByRef(id);
    const step = async (path: string, body: unknown) => {
      const r = await hubJson(`/v1/lab/cases/${hc!.id}${path}`, {
        method: 'POST',
        token: lab.token,
        body,
      });
      expect(r.status).toBeLessThan(300);
    };
    await step('/status', { to: 'accepted' });
    return { id, step };
  };

  test('approve_price doimiy 4xx (case.not_found): kutish tozalanadi, qayta tasdiq ishlaydi, bitta xarajat', async () => {
    const { id, step } = await sendAccepted();
    await step('/price', { price: 150000 });
    await pollLabHubChanges(tenantId);
    const approve = () =>
      whileHubDown(() =>
        call('doctor', 'POST', `/api/lab-orders/${id}/approve-price`, { price: '150000.00' }),
      );
    expect((await approve()).status).toBe(200);
    expect((await orderRow(id))?.priceApprovalRequestedPrice).toBe('150000.00');

    // Hub bu ishni topmaydi (masalan, tozalangan) — haqiqiy Hub 404 case.not_found qaytaradi.
    const missingCase = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      return fetch(
        url.includes('/approve-price')
          ? url.replace(`/cases/${id}/`, `/cases/${crypto.randomUUID()}/`)
          : url,
        init,
      );
    }) as typeof fetch;
    await releaseOutbox();
    await flushLabHubOutbox(tenantId, { fetchImpl: missingCase });

    const row = await orderRow(id);
    expect(row?.priceApprovalRequestedAt).toBeNull();
    expect(row?.priceApprovalRequestedPrice).toBeNull();
    expect(row?.approvedPrice).toBeNull();
    expect(await expensesOf(id)).toHaveLength(0);
    const [op] = await inTenant((tx) =>
      tx
        .select()
        .from(labHubOutbox)
        .where(and(eq(labHubOutbox.labOrderId, id), eq(labHubOutbox.op, 'approve_price'))),
    );
    expect(op?.status).toBe('rejected');
    expect(op?.lastError).toBe('case.not_found');

    // Foydalanuvchi qayta tasdiqlaydi — yangi op navbatga tushadi, Hub tasdiqlaydi → bitta xarajat.
    const again = await approve();
    expect(again.status).toBe(200);
    await releaseOutbox();
    await flushLabHubOutbox(tenantId);
    expect((await expensesOf(id)).map((e) => e.amount)).toEqual(['150000.00']);
    expect((await orderRow(id))?.approvedPrice).toBe('150000.00');
  });

  test('POST /api/lab-hub/outbox/requeue: Doctor 403; Tenant Admin qayta navbatga qo‘yadi → yuboriladi', async () => {
    const id = await createOrder();
    expect(
      (await call('doctor', 'POST', `/api/lab-orders/${id}/send-to-hub`, { labId: lab.labId }))
        .status,
    ).toBe(200);
    await releaseOutbox();
    await flushLabHubOutbox(tenantId);
    const objectKey = `${tenantId}/lab-orders/${id}/kech-${crypto.randomUUID()}.pdf`;
    await inTenant(async (tx) => {
      const [f] = await tx
        .insert(labOrderFiles)
        .values({
          tenantId,
          labOrderId: id,
          objectKey,
          originalFilename: 'kech.pdf',
          contentType: 'application/pdf',
          sizeBytes: 8,
        })
        .returning({ id: labOrderFiles.id });
      await tx
        .insert(labHubOutbox)
        .values({ tenantId, labOrderId: id, op: 'file', payload: { fileId: f!.id } });
    });
    await releaseOutbox();
    await flushLabHubOutbox(tenantId);
    const fileOp = async () =>
      (
        await inTenant((tx) =>
          tx
            .select()
            .from(labHubOutbox)
            .where(and(eq(labHubOutbox.labOrderId, id), eq(labHubOutbox.op, 'file'))),
        )
      )[0];
    expect((await fileOp())?.status).toBe('failed');
    expect((await orderRow(id))?.hubSyncStatus).toBe('failed');
    const st = await call('doctor', 'GET', '/api/lab-hub/status');
    expect(
      ((await st.json()) as { data: { failedOutbox: number } }).data.failedOutbox,
    ).toBeGreaterThan(0);

    // Fayl tiklandi (zaxiradan) — endi qayta yuborish mumkin.
    await createLocalStorageAdapter().save(objectKey, Buffer.from('KECH-PDF'));

    expect((await call('doctor', 'POST', '/api/lab-hub/outbox/requeue', {})).status).toBe(403);
    const res = await call('tenant_admin', 'POST', '/api/lab-hub/outbox/requeue', {
      labOrderId: id,
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { data: { requeued: number } }).data.requeued).toBe(1);

    await releaseOutbox();
    await flushLabHubOutbox(tenantId);
    expect((await fileOp())?.status).toBe('done');
    expect((await orderRow(id))?.hubSyncStatus).toBe('synced');
    const audits = await inTenant((tx) =>
      tx.select().from(auditLog).where(eq(auditLog.action, 'outbox_requeued')),
    );
    expect(audits).toHaveLength(1);
  });
});

// ─── FX-46 / FX-47 — bekor qilish va rad etilgan ishni qayta yuborish ─────────
describe('FX-46: bekor qilingan buyurtma — Hub’ga cancel op, narx/xarajat taqiq', () => {
  const sendCase = async () => {
    const id = await createOrder();
    expect(
      (await call('doctor', 'POST', `/api/lab-orders/${id}/send-to-hub`, { labId: lab.labId }))
        .status,
    ).toBe(200);
    await releaseOutbox();
    await flushLabHubOutbox(tenantId);
    const [hc] = await hubCaseByRef(id);
    const labPost = (path: string, body: unknown) =>
      hubJson(`/v1/lab/cases/${hc!.id}${path}`, { method: 'POST', token: lab.token, body });
    const step = async (path: string, body: unknown) => {
      const r = await labPost(path, body);
      expect(r.status).toBeLessThan(300);
    };
    await step('/status', { to: 'accepted' });
    return { id, step, labPost };
  };
  const outboxOps = (id: string) =>
    inTenant((tx) => tx.select().from(labHubOutbox).where(eq(labHubOutbox.labOrderId, id)));
  const codeOf = async (r: Response) =>
    ((await r.json()) as { error: { code: string } }).error.code;
  /** Faqat `match` yo'lidagi so'rovni almashtiradi, qolgani haqiqiy Hub'ga. */
  const intercept = (
    match: string,
    handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  ) =>
    (async (input: RequestInfo | URL, init?: RequestInit) =>
      String(input).includes(match) ? handler(input, init) : fetch(input, init)) as typeof fetch;

  test('cancelled: Hub’da ish yopiladi — lab o‘tishi va narx taklifi 409; klinikada narx tasdig‘i 409', async () => {
    const { id, step, labPost } = await sendCase();
    await step('/price', { price: 120000 });
    await pollLabHubChanges(tenantId);
    expect((await orderRow(id))?.proposedPrice).toBe('120000.00');

    const res = await whileHubDown(() =>
      call('doctor', 'PATCH', `/api/lab-orders/${id}`, { status: 'cancelled' }),
    );
    expect(res.status).toBe(200);
    expect((await outboxOps(id)).filter((o) => o.op === 'cancel')).toHaveLength(1);

    const ap = await call('doctor', 'POST', `/api/lab-orders/${id}/approve-price`, {
      price: '120000.00',
    });
    expect(ap.status).toBe(409);
    expect(await codeOf(ap)).toBe('lab_order.cancelled');

    await releaseOutbox();
    await flushLabHubOutbox(tenantId);
    expect((await outboxOps(id)).find((o) => o.op === 'cancel')?.status).toBe('done');
    expect((await hubCaseByRef(id))[0]?.status).toBe('cancelled');

    // Lab endi ishlay olmaydi va narx taklif qila olmaydi.
    const st = await labPost('/status', { to: 'in_progress' });
    expect(st.status).toBe(409);
    expect(await codeOf(st)).toBe('case.bad_transition');
    const pr = await labPost('/price', { price: 999000 });
    expect(pr.status).toBe(409);
    expect(await codeOf(pr)).toBe('case.cancelled');

    // Hub'ga to'g'ridan-to'g'ri approve ham o'tmaydi.
    const direct = await hubJson(`/v1/clinic/cases/${id}/approve-price`, {
      method: 'POST',
      token: await clinicHubKey(),
      body: { price: 120000 },
    });
    expect(direct.status).toBe(409);
    expect(await codeOf(direct)).toBe('case.cancelled');

    await pollLabHubChanges(tenantId);
    const row = await orderRow(id);
    expect(row?.hubStatus).toBe('cancelled');
    expect(row?.proposedPrice).toBe('120000.00');
    expect(await expensesOf(id)).toHaveLength(0);
    expect((await hubCaseByRef(id))[0]?.approved_price).toBeNull();
  });

  test('Hub’da cancel yo‘li yo‘q (eski Hub, 404 not_found) → op jim `done` EMAS, `failed`', async () => {
    const { id } = await sendCase();
    await whileHubDown(() =>
      call('doctor', 'PATCH', `/api/lab-orders/${id}`, { status: 'cancelled' }),
    );
    await releaseOutbox();
    await flushLabHubOutbox(tenantId, {
      fetchImpl: intercept('/cancel', async () =>
        Response.json({ error: { code: 'not_found' } }, { status: 404 }),
      ),
    });
    const op = (await outboxOps(id)).find((o) => o.op === 'cancel');
    expect(op?.status).toBe('failed');
    expect(op?.lastError).toBe('not_found');
    expect((await orderRow(id))?.hubSyncStatus).toBe('failed');
    expect((await hubCaseByRef(id))[0]?.status).toBe('accepted');
  });

  test('Hub’da ish yo‘q (case.not_found) → yopiladigan narsa yo‘q, op `done`', async () => {
    const { id } = await sendCase();
    await whileHubDown(() =>
      call('doctor', 'PATCH', `/api/lab-orders/${id}`, { status: 'cancelled' }),
    );
    await releaseOutbox();
    await flushLabHubOutbox(tenantId, {
      fetchImpl: intercept('/cancel', async () =>
        Response.json({ error: { code: 'case.not_found' } }, { status: 404 }),
      ),
    });
    expect((await outboxOps(id)).find((o) => o.op === 'cancel')?.status).toBe('done');
  });

  test('narx tasdig‘i Hub’ga yetib, javob yo‘qolsa: bekor qilish 409; qayta urinish xarajatni Hub bilan mos yozadi', async () => {
    const { id, step } = await sendCase();
    await step('/price', { price: 80000 });
    await pollLabHubChanges(tenantId);
    const r = await whileHubDown(() =>
      call('doctor', 'POST', `/api/lab-orders/${id}/approve-price`, { price: '80000.00' }),
    );
    expect(r.status).toBe(200);

    // Hub tasdiqlaydi, lekin javob klinikaga yetmaydi (timeout) — op kutishda qoladi.
    await releaseOutbox();
    await flushLabHubOutbox(tenantId, {
      fetchImpl: intercept('/approve-price', async (input, init) => {
        await fetch(input, init);
        throw new TypeError('socket timeout');
      }),
    });
    expect((await hubCaseByRef(id))[0]?.approved_price).toBe('80000.00');
    expect((await orderRow(id))?.priceApprovalRequestedAt).not.toBeNull();

    const cancel = await whileHubDown(() =>
      call('doctor', 'PATCH', `/api/lab-orders/${id}`, { status: 'cancelled' }),
    );
    expect(cancel.status).toBe(409);
    expect(await codeOf(cancel)).toBe('lab_order.price_approval_pending');
    const still = await orderRow(id);
    expect(still?.status).not.toBe('cancelled');
    expect(still?.priceApprovalRequestedAt).not.toBeNull();
    expect((await outboxOps(id)).filter((o) => o.op === 'cancel')).toHaveLength(0);

    // Qayta urinish: Hub `alreadyApproved` → aynan bitta xarajat, Hub bilan mos.
    await releaseOutbox();
    await flushLabHubOutbox(tenantId);
    const ex = await expensesOf(id);
    expect(ex).toHaveLength(1);
    expect(ex[0]?.amount).toBe('80000.00');
    expect((await orderRow(id))?.approvedPrice).toBe('80000.00');

    // Endi bekor qilish o'tadi va Hub'ga yetadi; tasdiqlangan narx (akt-sverka) saqlanadi.
    const ok = await call('doctor', 'PATCH', `/api/lab-orders/${id}`, { status: 'cancelled' });
    expect(ok.status).toBe(200);
    await releaseOutbox();
    await flushLabHubOutbox(tenantId);
    const [hc] = await hubCaseByRef(id);
    expect(hc?.status).toBe('cancelled');
    expect(hc?.approved_price).toBe('80000.00');
    expect(await expensesOf(id)).toHaveLength(1);
  });

  test('Hub tasdig‘i bekor qilingan ishga kelsa — Hub haqiqat manbai: xarajat yoziladi va xodim ogohlantiriladi', async () => {
    const { id } = await sendCase();
    await call('doctor', 'PATCH', `/api/lab-orders/${id}`, { status: 'cancelled' });
    const booked = await inTenant((tx) =>
      bookHubConfirmedPrice(tx, tenantId, id, '50000.00', new Date()),
    );
    expect(booked.booked).toBe(true);
    const ex = await expensesOf(id);
    expect(ex).toHaveLength(1);
    expect(ex[0]?.amount).toBe('50000.00');
    expect((await orderRow(id))?.approvedPrice).toBe('50000.00');
    const notes = await inTenant((tx) =>
      tx
        .select()
        .from(notifications)
        .where(and(eq(notifications.userId, userId), eq(notifications.type, 'lab_hub.price'))),
    );
    expect(notes.some((n) => n.title.toLowerCase().includes('bekor qilingan'))).toBe(true);
  });
});

describe('FX-47: rad etilgan ish — boshqa labga qayta yuborish', () => {
  let lab2: Awaited<ReturnType<typeof createHubLab>>;

  const linkLab = async (l: typeof lab) => {
    const req = await call('tenant_admin', 'POST', '/api/lab-hub/links', { labId: l.labId });
    expect(req.status).toBe(200);
    const linkId = ((await req.json()) as { data: { link: { id: string } } }).data.link.id;
    const d = await hubJson(`/v1/lab/links/${linkId}/decision`, {
      method: 'POST',
      token: l.token,
      body: { decision: 'approve' },
    });
    expect(d.status).toBe(200);
    await call('doctor', 'GET', '/api/lab-hub/labs'); // labsCache yangilanadi
  };

  test('rad etilgach: narx tasdig‘i 409; boshqa labga yuborish → yangi ref, eski holat tozalanadi', async () => {
    lab2 = await createHubLab();
    await linkLab(lab2);

    const id = await createOrder();
    expect(
      (await call('doctor', 'POST', `/api/lab-orders/${id}/send-to-hub`, { labId: lab.labId }))
        .status,
    ).toBe(200);
    await releaseOutbox();
    await flushLabHubOutbox(tenantId);
    const [hc] = await hubCaseByRef(id);
    const step = async (path: string, body: unknown) => {
      const r = await hubJson(`/v1/lab/cases/${hc!.id}${path}`, {
        method: 'POST',
        token: lab.token,
        body,
      });
      expect(r.status).toBeLessThan(300);
    };
    await step('/price', { price: 200000 });
    await step('/status', { to: 'rejected', reason: 'Zirkoniy yo‘q' });
    await pollLabHubChanges(tenantId);
    const rejected = await orderRow(id);
    expect(rejected?.hubStatus).toBe('rejected');
    expect(rejected?.proposedPrice).toBe('200000.00');

    // Rad etilgan ishga narx tasdig‘i yo‘q.
    const ap = await call('doctor', 'POST', `/api/lab-orders/${id}/approve-price`, {
      price: '200000.00',
    });
    expect(ap.status).toBe(409);
    expect(((await ap.json()) as { error: { code: string } }).error.code).toBe('lab_hub.rejected');
    expect(await expensesOf(id)).toHaveLength(0);

    // Boshqa labga qayta yuborish.
    const re = await call('doctor', 'POST', `/api/lab-orders/${id}/send-to-hub`, {
      labId: lab2.labId,
    });
    expect(re.status).toBe(200);
    const row = await orderRow(id);
    expect(row?.labHubLabId).toBe(lab2.labId);
    expect(row?.labHubCaseRef).not.toBe(id);
    expect(row?.hubStatus).not.toBe('rejected'); // kick allaqachon yangi ishni push qilishi mumkin ("sent")
    expect(row?.hubRejectReason).toBeNull();
    expect(row?.proposedPrice).toBeNull();

    await releaseOutbox();
    await flushLabHubOutbox(tenantId);
    const fresh = await hubCaseByRef(row!.labHubCaseRef as string);
    expect(fresh).toHaveLength(1);
    expect(fresh[0]?.status).toBe('sent');
    expect((await orderRow(id))?.hubSyncStatus).toBe('synced');
    // Eski (rad etilgan) ish Hub’da yopildi (cancel op) — rad etgan lab uni qayta ololmaydi.
    expect((await hubCaseByRef(id))[0]?.status).toBe('cancelled');

    // Rad etilmagan (faol) ishni qayta yuborib bo‘lmaydi.
    const again = await call('doctor', 'POST', `/api/lab-orders/${id}/send-to-hub`, {
      labId: lab.labId,
    });
    expect(again.status).toBe(409);
  });

  test('TOCTOU: lab poll’dan keyin rad etdi, klinika hali bilmaydi — Hub tasdiqni 409, xarajat yo‘q, qayta yuborish ishlaydi', async () => {
    const id = await createOrder();
    expect(
      (await call('doctor', 'POST', `/api/lab-orders/${id}/send-to-hub`, { labId: lab.labId }))
        .status,
    ).toBe(200);
    await releaseOutbox();
    await flushLabHubOutbox(tenantId);
    const [hc] = await hubCaseByRef(id);
    const labPost = (path: string, body: unknown) =>
      hubJson(`/v1/lab/cases/${hc!.id}${path}`, { method: 'POST', token: lab.token, body });
    expect((await labPost('/status', { to: 'accepted' })).status).toBe(200);
    expect((await labPost('/price', { price: 200000 })).status).toBe(200);
    await pollLabHubChanges(tenantId);
    expect((await orderRow(id))?.proposedPrice).toBe('200000.00');

    // Lab rad etadi — klinika hali poll qilmagan (lokal hubStatus = accepted).
    expect((await labPost('/status', { to: 'rejected', reason: 'Material yo‘q' })).status).toBe(
      200,
    );
    expect((await orderRow(id))?.hubStatus).toBe('accepted');

    const ap = await whileHubDown(() =>
      call('doctor', 'POST', `/api/lab-orders/${id}/approve-price`, { price: '200000.00' }),
    );
    expect(ap.status).toBe(200); // lokal tekshiruv o'tadi — kutish holati
    await releaseOutbox();
    await flushLabHubOutbox(tenantId);

    // Hub rad etilgan ishni tasdiqlamaydi; kutish tozalanadi, xarajat yo‘q.
    expect((await hubCaseByRef(id))[0]?.approved_price).toBeNull();
    const op = (
      await inTenant((tx) => tx.select().from(labHubOutbox).where(eq(labHubOutbox.labOrderId, id)))
    ).find((o) => o.op === 'approve_price');
    expect(op?.status).toBe('rejected');
    expect(op?.lastError).toBe('case.rejected');
    const row = await orderRow(id);
    expect(row?.priceApprovalRequestedAt).toBeNull();
    expect(row?.approvedPrice).toBeNull();
    expect(await expensesOf(id)).toHaveLength(0);
    const notes = await inTenant((tx) =>
      tx
        .select()
        .from(notifications)
        .where(and(eq(notifications.userId, userId), eq(notifications.type, 'lab_hub.price'))),
    );
    expect(notes.some((n) => n.title.includes('rad etgan'))).toBe(true);

    // Lab rad etilgan ishga narx taklif qila olmaydi.
    const pr = await labPost('/price', { price: 250000 });
    expect(pr.status).toBe(409);
    expect(((await pr.json()) as { error: { code: string } }).error.code).toBe('case.rejected');

    // Poll rad etishni olib keladi → boshqa labga qayta yuborish ishlaydi (qotib qolmaydi).
    await pollLabHubChanges(tenantId);
    expect((await orderRow(id))?.hubStatus).toBe('rejected');
    const re = await call('doctor', 'POST', `/api/lab-orders/${id}/send-to-hub`, {
      labId: lab2.labId,
    });
    expect(re.status).toBe(200);
  });

  test('seam (× FX-48/49): eski ref’ning failed op’i ham superseded — qayta yuborilgach «synced», requeue uni tiriltirmaydi', async () => {
    const id = await createOrder();
    expect(
      (await call('doctor', 'POST', `/api/lab-orders/${id}/send-to-hub`, { labId: lab.labId }))
        .status,
    ).toBe(200);
    await releaseOutbox();
    await flushLabHubOutbox(tenantId);
    const [hc] = await hubCaseByRef(id);
    const r = await hubJson(`/v1/lab/cases/${hc!.id}/status`, {
      method: 'POST',
      token: lab.token,
      body: { to: 'rejected', reason: 'Material yo‘q' },
    });
    expect(r.status).toBeLessThan(300);
    await pollLabHubChanges(tenantId);
    expect((await orderRow(id))?.hubStatus).toBe('rejected');

    // Eski ref uchun qayta urinib bo'lmaydigan (failed) op — masalan rad etilgan ishga xabar.
    const [failedOp] = await inTenant((tx) =>
      tx
        .insert(labHubOutbox)
        .values({
          tenantId,
          labOrderId: id,
          op: 'message',
          payload: { text: 'eski labga xabar' },
          status: 'failed',
          attempts: 1,
          lastError: 'case.rejected',
        })
        .returning({ id: labHubOutbox.id }),
    );
    await inTenant((tx) =>
      tx.update(labOrders).set({ hubSyncStatus: 'failed' }).where(eq(labOrders.id, id)),
    );

    const re = await call('doctor', 'POST', `/api/lab-orders/${id}/send-to-hub`, {
      labId: lab2.labId,
    });
    expect(re.status).toBe(200);
    const opAfter = await inTenant((tx) =>
      tx.select().from(labHubOutbox).where(eq(labHubOutbox.id, failedOp!.id)),
    );
    expect(opAfter[0]?.status).toBe('superseded');

    await releaseOutbox();
    await flushLabHubOutbox(tenantId);
    expect((await orderRow(id))?.hubSyncStatus).toBe('synced');

    // Requeue eski op'ni qayta navbatga qo'ymaydi (u failed emas).
    const rq = await call('tenant_admin', 'POST', '/api/lab-hub/outbox/requeue', {
      labOrderId: id,
    });
    expect(rq.status).toBe(200);
    expect(((await rq.json()) as { data: { requeued: number } }).data.requeued).toBe(0);
    const opFinal = await inTenant((tx) =>
      tx.select().from(labHubOutbox).where(eq(labHubOutbox.id, failedOp!.id)),
    );
    expect(opFinal[0]?.status).toBe('superseded');
  });
});

describe('FX-80: Hub tasdig‘idan yozilgan «Laboratoriya» xarajati qo‘lda buzilmaydi', () => {
  const approvedOrder = async () => {
    const id = await createOrder();
    expect(
      (await call('doctor', 'POST', `/api/lab-orders/${id}/send-to-hub`, { labId: lab.labId }))
        .status,
    ).toBe(200);
    await releaseOutbox();
    await flushLabHubOutbox(tenantId);
    const [hc] = await hubCaseByRef(id);
    for (const [path, body] of [
      ['/status', { to: 'accepted' }],
      ['/price', { price: 410000 }],
    ] as const) {
      const r = await hubJson(`/v1/lab/cases/${hc!.id}${path}`, {
        method: 'POST',
        token: lab.token,
        body,
      });
      expect(r.status).toBeLessThan(300);
    }
    await pollLabHubChanges(tenantId);
    expect(
      (await call('doctor', 'POST', `/api/lab-orders/${id}/approve-price`, { price: '410000.00' }))
        .status,
    ).toBe(200);
    await releaseOutbox();
    await flushLabHubOutbox(tenantId);
    const [exp] = await expensesOf(id);
    expect(exp?.amount).toBe('410000.00');
    return { id, expenseId: exp!.id };
  };
  const code = async (r: Response) => ((await r.json()) as { error: { code: string } }).error.code;

  test('summa/sana/kategoriya/filial tahriri va o‘chirish → 409; faqat izoh o‘zgaradi', async () => {
    const { id, expenseId } = await approvedOrder();

    for (const body of [{ amount: 1 }, { date: '2020-01-01' }, { amount: 5, note: 'x' }]) {
      const r = await call('accountant', 'PATCH', `/api/expenses/${expenseId}`, body);
      expect(r.status).toBe(409);
      expect(await code(r)).toBe('expense.lab_order_linked');
    }
    const del = await call('accountant', 'DELETE', `/api/expenses/${expenseId}`);
    expect(del.status).toBe(409);
    expect(await code(del)).toBe('expense.lab_order_linked');

    const [still] = await expensesOf(id);
    expect(still?.amount).toBe('410000.00');
    expect(still?.date).toBe(
      (await inTenant((tx) => tx.select().from(expenses).where(eq(expenses.id, expenseId))))[0]
        ?.date,
    );

    // Hub bilan bog'liq bo'lmagan maydon — izoh — ruxsat; forma qayta yuborgan o'zgarmagan summa ham.
    const note = await call('accountant', 'PATCH', `/api/expenses/${expenseId}`, {
      note: 'Hisob-faktura 17',
      amount: 410000,
    });
    expect(note.status).toBe(200);
    const [after] = await expensesOf(id);
    expect(after?.note).toBe('Hisob-faktura 17');
    expect(after?.amount).toBe('410000.00');
  });

  test('oddiy (labsiz) xarajat avvalgidek tahrirlanadi va o‘chiriladi', async () => {
    const cat = await call('accountant', 'POST', '/api/expense-categories', { name: 'Ijara FX80' });
    expect(cat.status).toBe(201);
    const categoryId = ((await cat.json()) as { data: { id: string } }).data.id;
    const created = await call('accountant', 'POST', '/api/expenses', {
      categoryId,
      amount: 1000,
      date: '2026-11-01',
    });
    expect(created.status).toBe(201);
    const eid = ((await created.json()) as { data: { id: string } }).data.id;
    expect(
      (await call('accountant', 'PATCH', `/api/expenses/${eid}`, { amount: 2000 })).status,
    ).toBe(200);
    expect((await call('accountant', 'DELETE', `/api/expenses/${eid}`)).status).toBe(200);
  });
});

describe('FX-78: klinika tayyor/yetkazilgan ishni qayta ishlashga qaytaradi (remake)', () => {
  const sendCase = async () => {
    const id = await createOrder();
    expect(
      (await call('doctor', 'POST', `/api/lab-orders/${id}/send-to-hub`, { labId: lab.labId }))
        .status,
    ).toBe(200);
    await releaseOutbox();
    await flushLabHubOutbox(tenantId);
    const [hc] = await hubCaseByRef(id);
    const step = async (path: string, body: unknown) => {
      const r = await hubJson(`/v1/lab/cases/${hc!.id}${path}`, {
        method: 'POST',
        token: lab.token,
        body,
      });
      expect(r.status).toBeLessThan(300);
    };
    await step('/status', { to: 'accepted' });
    return { id, step, hubId: hc!.id };
  };
  const remake = (id: string, body: unknown = { reason: 'Rang mos emas' }, role = 'doctor') =>
    call(role, 'POST', `/api/lab-orders/${id}/remake`, body);
  const code = async (r: Response) => ((await r.json()) as { error: { code: string } }).error.code;

  test('ready/delivered → remake op → Hub remake + sabab xabari; lab qabul qilsa «jarayonda»; narx/xarajat tegilmaydi', async () => {
    const { id, step, hubId } = await sendCase();
    // Hali tayyor emas — qayta ishlash so'rab bo'lmaydi.
    const early = await remake(id);
    expect(early.status).toBe(409);
    expect(await code(early)).toBe('lab_hub.not_remakable');

    await step('/price', { price: 275000 });
    await step('/status', { to: 'in_progress' });
    await step('/status', { to: 'ready' });
    await pollLabHubChanges(tenantId);
    expect((await orderRow(id))?.hubStatus).toBe('ready');
    expect(
      (await call('doctor', 'POST', `/api/lab-orders/${id}/approve-price`, { price: '275000.00' }))
        .status,
    ).toBe(200);
    await releaseOutbox();
    await flushLabHubOutbox(tenantId);
    expect(await expensesOf(id)).toHaveLength(1);
    expect(
      (await call('doctor', 'PATCH', `/api/lab-orders/${id}`, { status: 'delivered' })).status,
    ).toBe(200);
    await releaseOutbox();
    await flushLabHubOutbox(tenantId);
    await pollLabHubChanges(tenantId);
    expect((await orderRow(id))?.status).toBe('delivered');

    // Ruxsat: lab_order.manage yo'q (Nurse) → 403; sababsiz ham mumkin; sabab uzunligi cheklangan.
    expect((await remake(id, { reason: 'x' }, 'nurse')).status).toBe(403);
    expect((await remake(id, { reason: 'x'.repeat(2001) })).status).toBe(400);

    const res = await remake(id);
    expect(res.status).toBe(200);
    const ops = await inTenant((tx) =>
      tx.select().from(labHubOutbox).where(eq(labHubOutbox.labOrderId, id)),
    );
    expect(ops.filter((o) => o.op === 'remake')).toHaveLength(1);
    // Takroriy bosish — yangi op yo'q (idempotent).
    expect((await remake(id)).status).toBe(200);
    expect(
      (
        await inTenant((tx) =>
          tx.select().from(labHubOutbox).where(eq(labHubOutbox.labOrderId, id)),
        )
      ).filter((o) => o.op === 'remake'),
    ).toHaveLength(1);

    await releaseOutbox();
    await flushLabHubOutbox(tenantId);
    expect((await hubCaseByRef(id))[0]?.status).toBe('remake');
    const hubMsgs =
      (await hubAdmin`SELECT author FROM case_messages WHERE case_id = ${hubId}`) as unknown as {
        author: string;
      }[];
    expect(hubMsgs.filter((m) => m.author === 'clinic').length).toBeGreaterThanOrEqual(1);

    await pollLabHubChanges(tenantId);
    expect((await orderRow(id))?.hubStatus).toBe('remake');
    // Qayta ishlash so'ralgan ishni yana so'rab bo'lmaydi.
    expect((await remake(id)).status).toBe(200);

    await step('/status', { to: 'accepted' });
    await pollLabHubChanges(tenantId);
    const row = await orderRow(id);
    expect(row?.status).toBe('in_progress');
    expect(row?.hubStatus).toBe('accepted');
    expect(row?.deliveredDate).toBeNull();
    // Tasdiqlangan narx va xarajat o'zgarmaydi.
    expect(row?.approvedPrice).toBe('275000.00');
    const exps = await expensesOf(id);
    expect(exps).toHaveLength(1);
    expect(exps[0]?.amount).toBe('275000.00');
  });

  test('Hub’ga yuborilmagan / bekor qilingan ishga remake 409', async () => {
    const local = await createOrder();
    const r1 = await remake(local);
    expect(r1.status).toBe(409);
    expect(await code(r1)).toBe('lab_hub.not_sent');

    const { id } = await sendCase();
    expect(
      (await call('doctor', 'PATCH', `/api/lab-orders/${id}`, { status: 'cancelled' })).status,
    ).toBe(200);
    const r2 = await remake(id);
    expect(r2.status).toBe(409);
  });
});
