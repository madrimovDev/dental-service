/**
 * Lab Hub W2 (clinic-sync) — klinika `apps/api` ↔ HAQIQIY `apps/lab-hub-api` ilovasi.
 *
 * Hub in-process (`createApp(deps)`) haqiqiy HTTP serverda (`Bun.serve`, port 0) va o'z
 * lane bazasida (`apps/lab-hub-api/.env` → `lab_hub_test_<lane>`, non-superuser rol, RLS)
 * ishlaydi; klinika tomoni — haqiqiy klinika bazasi (RLS, audit). Faqat Supervisor
 * soxta (u Hub'ning bog'liqligi, boshqa ilova). Rollar — real shablon permset'lari
 * (Doctor / Tenant Admin / Accountant), `@owner` EMAS.
 *
 * Tekshiriladi:
 *  - PHI mapper (L3): telefon/manzil/pasport hech qachon Hub so'roviga tushmaydi
 *    (mapper chiqishi + simdagi haqiqiy PUT tanasi) va Hub'ning `.strict()` sxemasi uni qabul qiladi;
 *  - offline navbat: Hub o'chiq → ish navbatda qoladi, qaytganda BIR marta ketadi,
 *    javob yo'qolsa (qayta yuborish) dublikat yo'q (`clinic_case_ref` idempotent);
 *  - poll: lab holati/narx taklifi/xabari klinika buyurtmasiga tushadi + bildirishnoma;
 *    kursor qayta o'qilsa (sahifa qayta kelsa) hech narsa ikki marta qo'llanmaydi;
 *  - narx tasdig'i ikki marta (ketma-ket va parallel) → `expenses`da bitta yozuv;
 *  - ruxsatlar: Accountant tasdiqlay olmaydi, Doctor ulana olmaydi.
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
import { toHubCase } from '../../src/lib/lab-hub/mapper.ts';
import { flushLabHubOutbox, pollLabHubChanges } from '../../src/lib/lab-hub/sync.ts';

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
  test('Accountant tasdiqlay olmaydi (403)', async () => {
    const res = await call('accountant', 'POST', `/api/lab-orders/${orderId}/approve-price`, {
      price: '350000.00',
    });
    expect(res.status).toBe(403);
  });

  test('ikki marta (parallel + ketma-ket) → bitta expense; Hub’da approved_price', async () => {
    const approve = (price: unknown) =>
      call('doctor', 'POST', `/api/lab-orders/${orderId}/approve-price`, { price });
    const [a, b] = await Promise.all([approve('350000.00'), approve('350000.00')]);
    expect([a.status, b.status].sort()).toEqual([200, 200]);
    const third = await approve(350000);
    expect(third.status).toBe(200);
    expect(
      ((await third.json()) as { data: { alreadyApproved: boolean } }).data.alreadyApproved,
    ).toBe(true);

    // Tasdiqlangandan keyin boshqa summa — 409, yangi xarajat yo'q.
    const other = await approve('400000.00');
    expect(other.status).toBe(409);
    expect(((await other.json()) as { error: { code: string } }).error.code).toBe(
      'price.already_approved',
    );

    const rows = await inTenant((tx) =>
      tx.select().from(expenses).where(eq(expenses.labOrderId, orderId)),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.amount).toBe('350000.00');
    expect((await orderRow(orderId))?.approvedPrice).toBe('350000.00');

    await releaseOutbox();
    await flushLabHubOutbox(tenantId);
    expect((await hubCaseByRef(orderId))[0]?.approved_price).toBe('350000.00');
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
  const approve = (id: string, price: unknown) =>
    call('doctor', 'POST', `/api/lab-orders/${id}/approve-price`, { price });
  const expensesOf = (id: string) =>
    inTenant((tx) => tx.select().from(expenses).where(eq(expenses.labOrderId, id)));

  test('narxsiz so‘rov 400, xarajat yo‘q', async () => {
    const { id, step } = await sendCase();
    await step('/price', { price: 100000 });
    await pollLabHubChanges(tenantId);
    const res = await call('doctor', 'POST', `/api/lab-orders/${id}/approve-price`, {});
    expect(res.status).toBe(400);
    expect(await expensesOf(id)).toHaveLength(0);
  });

  test('TOCTOU: ekranda 100000, poll 300000 ni olib keldi → 409 price.changed, xarajat yo‘q', async () => {
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
    expect((await orderRow(id))?.approvedPrice).toBeNull();

    // Yangi narx ko'rilib tasdiqlanadi → bitta xarajat va Hub'da tasdiq.
    expect((await approve(id, '300000.00')).status).toBe(200);
    await releaseOutbox();
    await flushLabHubOutbox(tenantId);
    expect((await expensesOf(id)).map((e) => e.amount)).toEqual(['300000.00']);
    expect((await hubCaseByRef(id))[0]?.approved_price).toBe('300000.00');
  });

  test('Hub price.mismatch: lokal tasdiq va xarajat qaytariladi, yangi taklif tashlanmaydi', async () => {
    const { id, step } = await sendCase();
    await step('/price', { price: 100000 });
    await pollLabHubChanges(tenantId);
    await step('/price', { price: 300000 }); // lab tuzatdi, klinika hali poll qilmagan

    // Hub vaqtincha yetib bo'lmaydi — tasdiq navbatda (commit'dan keyingi kick yiqiladi).
    process.env.LAB_HUB_URL = DEAD_URL;
    const res = await approve(id, '100000.00');
    process.env.LAB_HUB_URL = HUB_URL;
    expect(res.status).toBe(200);
    expect((await expensesOf(id)).map((e) => e.amount)).toEqual(['100000.00']);
    expect((await orderRow(id))?.approvedPrice).toBe('100000.00');

    // Poll lokal tasdiq turganida ham Hub'dagi yangi taklifni oladi.
    await pollLabHubChanges(tenantId);
    expect((await orderRow(id))?.proposedPrice).toBe('300000.00');

    // Push: Hub 409 price.mismatch → lokal tasdiq qaytariladi.
    await releaseOutbox();
    await flushLabHubOutbox(tenantId);
    const row = await orderRow(id);
    expect(row?.approvedPrice).toBeNull();
    expect(row?.approvedAt).toBeNull();
    expect(row?.cost).toBeNull();
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
        .where(and(eq(auditLog.resourceId, id), eq(auditLog.action, 'price_approval_reverted'))),
    );
    expect(audits).toHaveLength(1);
    const [hc] = await hubCaseByRef(id);
    expect(hc?.approved_price).toBeNull();

    // Eski narx bilan qayta bosish — endi 409 (ekran yangilanadi), yangi narx bilan — o'tadi.
    expect((await approve(id, '100000.00')).status).toBe(409);
    const ok = await approve(id, '300000.00');
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { data: { alreadyApproved: boolean } }).data.alreadyApproved).toBe(
      false,
    );
    await releaseOutbox();
    await flushLabHubOutbox(tenantId);
    expect((await expensesOf(id)).map((e) => e.amount)).toEqual(['300000.00']);
    expect((await orderRow(id))?.approvedPrice).toBe('300000.00');
    expect((await hubCaseByRef(id))[0]?.approved_price).toBe('300000.00');
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
