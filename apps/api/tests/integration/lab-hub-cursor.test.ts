/**
 * Lab Hub kursori va dedup'i — Hub qayta o'rnatilgan / zaxiradan tiklangan holatlar
 * (FX-97 / LB-06, FX-93 / LB-02, FX-98 / LB-07).
 *
 * Klinika `apps/api` ↔ HAQIQIY `apps/lab-hub-api` ilovasi (in-process `Bun.serve`, o'z lane
 * bazasi, non-superuser rol + RLS). Klinika tomoni — haqiqiy baza (RLS). Faqat Supervisor
 * soxta. Ulanish — real Tenant Admin shablon permset'i bilan (`@owner` EMAS).
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env --timeout 30000 lab-hub-cursor`
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROLE_TEMPLATES } from '@dental/core';
import {
  labHubAppliedEvents,
  labHubState,
  tenantSettings,
  tenants,
  users,
} from '@dental/db-schema';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import { createApp as createHubApp } from '../../../lab-hub-api/src/app.ts';
import { loadConfig as loadHubConfig } from '../../../lab-hub-api/src/config.ts';
import { createDb as createHubDb } from '../../../lab-hub-api/src/db/client.ts';
import { createKeyring } from '../../../lab-hub-api/src/lib/keyring.ts';
import { createStorage } from '../../../lab-hub-api/src/lib/storage.ts';
import type { SupervisorClient } from '../../../lab-hub-api/src/lib/supervisor-client.ts';
import { createApp } from '../../src/app.ts';
import { db } from '../../src/db/client.ts';
import { signAccess } from '../../src/lib/jwt.ts';
import { hubKeyOf } from '../../src/lib/lab-hub/state.ts';
import { pollLabHubChanges } from '../../src/lib/lab-hub/sync.ts';

// ─── Hub (haqiqiy ilova, o'z bazasi) ─────────────────────────────────────────
const parseEnv = (path: string): Record<string, string> =>
  Object.fromEntries(
    readFileSync(path, 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#') && l.includes('='))
      .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
  );
const secretDir = mkdtempSync(join(tmpdir(), 'lab-hub-cursor-secret-'));
process.env.MESSAGING_SECRET_PATH ??= join(secretDir, 'messaging-secret.txt');

const hubEnv = parseEnv(join(import.meta.dir, '../../../lab-hub-api/.env'));
const hubUploads = mkdtempSync(join(tmpdir(), 'lab-hub-cursor-'));
const hubConfig = loadHubConfig({
  ...hubEnv,
  UPLOADS_DIR: hubUploads,
  SAAS_HUB_TOKEN: hubEnv.SAAS_HUB_TOKEN || 'clinic-cursor-saas-hub-token-0123456789abcdef',
});
const hubDb = createHubDb(hubConfig.databaseUrl, 5);
const hubAdmin = postgres(hubEnv.DATABASE_ADMIN_URL as string, { max: 2, onnotice: () => {} });

const supervisorRegistry = new Map<string, { name: string; expiresAt: string }>();
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
      name: `Kursor Lab ${crypto.randomUUID().slice(0, 6)}`,
      city: 'Toshkent',
      catalogVisible: true,
      expiresAt: new Date(Date.now() + 365 * 86_400_000).toISOString(),
      leadFullName: 'Lab Rahbari',
      leadPhone: phone,
    },
  });
  if (res.status !== 201) throw new Error(`createHubLab ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { lab: { id: string }; lead: { tempPassword: string } };
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
  return { labId: body.lab.id, token };
};

// ─── Klinika ────────────────────────────────────────────────────────────────
const app = createApp();
let tenantId: string;
let userId: string;
let lab: Awaited<ReturnType<typeof createHubLab>>;

const permsOf = (key: string) => {
  const tpl = ROLE_TEMPLATES.find((r) => r.templateKey === key);
  if (!tpl) throw new Error(`template ${key}`);
  return [...tpl.permissions];
};
const connectAsTenantAdmin = async () => {
  const { token } = await signAccess({
    sub: userId,
    atid: tenantId,
    abid: null,
    perms: permsOf('tenant_admin'),
    roleKey: null,
    lang: 'uz',
  });
  const res = await app.request('/api/lab-hub/connect', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  expect(res.status).toBe(200);
  return ((await res.json()) as { data: { hubClinicId: string } }).data.hubClinicId;
};

const inTenant = <T>(fn: (tx: typeof db) => Promise<T>) =>
  db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`);
    return fn(tx as unknown as typeof db);
  });

const state = async () => (await inTenant((tx) => tx.select().from(labHubState)))[0]!;
const setCursor = (cursor: string) => inTenant((tx) => tx.update(labHubState).set({ cursor }));
const appliedCount = async () =>
  (await inTenant((tx) => tx.select().from(labHubAppliedEvents))).length;

/** Klinika Hub kaliti bilan to'g'ridan-to'g'ri: lab ulanishi + yangi ish (`created` hodisasi). */
const hubKey = async () => hubKeyOf(await state()) as string;
const linkAndSendCase = async () => {
  const key = await hubKey();
  const r = await hubJson('/v1/clinic/links', {
    method: 'POST',
    token: key,
    body: { labId: lab.labId },
  });
  expect(r.status).toBe(200);
  const { link } = (await r.json()) as { link: { id: string; status: string } };
  if (link.status !== 'active') {
    const d = await hubJson(`/v1/lab/links/${link.id}/decision`, {
      method: 'POST',
      token: lab.token,
      body: { decision: 'approve' },
    });
    expect(d.status).toBe(200);
  }
  const ref = crypto.randomUUID();
  const put = await hubJson(`/v1/clinic/cases/${ref}`, {
    method: 'PUT',
    token: key,
    body: {
      labId: lab.labId,
      patient: { fullName: 'Karimova Dilnoza', sex: 'female', age: 34 },
      teeth: [11],
      workType: 'Toj (crown)',
    },
  });
  expect(put.status).toBe(200);
  return ref;
};

/** Hub kursori faqat yakunlangan tranzaksiyalarni beradi — parallel lane yozuvchisi uchun qisqa kutish. */
const pollUntilApplied = async (min: number) => {
  let total = 0;
  for (let i = 0; i < 30 && total < min; i++) {
    total += (await pollLabHubChanges(tenantId)).applied;
    if (total < min) await Bun.sleep(100);
  }
  return total;
};

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
    .values({ phone: '+998900007722', passwordHash: 'x', fullName: 'Admin Kursor' })
    .returning({ id: users.id });
  userId = u!.id;
  const [t] = await db
    .insert(tenants)
    .values({ name: 'Kursor Klinika', slug: `kursor-klinika-${Date.now()}`, ownerUserId: userId })
    .returning({ id: tenants.id });
  tenantId = t!.id;
  const supervisorClinicId = crypto.randomUUID();
  supervisorRegistry.set(supervisorClinicId, {
    name: 'Kursor Klinika',
    expiresAt: new Date(Date.now() + 365 * 86_400_000).toISOString(),
  });
  await inTenant((tx) => tx.insert(tenantSettings).values({ tenantId, supervisorClinicId }));
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

// ─── FX-97 / LB-06 ───────────────────────────────────────────────────────────
describe('qayta ulanish — hubClinicId o‘zgarsa kursor va dedup tiklanadi (FX-97)', () => {
  test('bir xil hubClinicId bilan qayta ulanish kursorga tegmaydi', async () => {
    const first = await connectAsTenantAdmin();
    await setCursor('123.45');
    const again = await connectAsTenantAdmin();
    expect(again).toBe(first);
    expect((await state()).cursor).toBe('123.45');
  });

  test('Hub toza o‘rnatildi (yangi hubClinicId): kursor 0.0, applied_events tozalanadi, yangi hodisa yetadi', async () => {
    const oldId = (await state()).hubClinicId as string;
    // Eski Hub'da oylar davomida to'plangan holat: katta kursor + qo'llangan seq'lar.
    await setCursor('9000000000000.1530');
    await inTenant((tx) =>
      tx.insert(labHubAppliedEvents).values([1, 2, 3, 4, 5].map((seq) => ({ tenantId, seq }))),
    );
    // Hub volume yo'qoldi — klinika qatori yo'q (yangi Hub), «Qayta ulash».
    await hubAdmin`DELETE FROM clinics WHERE id = ${oldId}`;
    const newId = await connectAsTenantAdmin();
    expect(newId).not.toBe(oldId);
    expect((await state()).cursor).toBe('0.0');
    expect(await appliedCount()).toBe(0);

    await linkAndSendCase();
    expect(await pollUntilApplied(1)).toBeGreaterThanOrEqual(1);
  });
});

// ─── FX-93 / LB-02 ───────────────────────────────────────────────────────────
describe('Hub shu klasterga zaxiradan tiklandi — qayta ishlatilgan seq tashlanmaydi (FX-93)', () => {
  test('tiklashdan keyingi yangi hodisa (eski seq, yangi tx) klinikaga yetadi', async () => {
    await pollUntilApplied(0); // oldingi hodisalarni yutib yuboramiz
    const [{ seqName }] = (await hubAdmin`
      SELECT pg_get_serial_sequence('case_events', 'seq') AS "seqName"`) as unknown as {
      seqName: string;
    }[];
    // Zaxira nuqtasi: sequence S0 da.
    const [{ s0 }] = (await hubAdmin`
      SELECT nextval(${seqName}::regclass)::bigint AS s0`) as unknown as { s0: string }[];

    // Zaxiradan KEYIN: ish yuborildi, klinika uning hodisa(lar)ini qo'lladi (seq > S0).
    const lost = await linkAndSendCase();
    expect(await pollUntilApplied(1)).toBeGreaterThanOrEqual(1);

    // Vendor kechagi zaxirani tiklaydi (`pg_restore --clean`): S0 dan keyingi qatorlar yo'q,
    // sequence S0 ga qaytadi. xid hisoblagichi esa (shu klaster) oldinga ketgan.
    await hubAdmin`DELETE FROM cases WHERE clinic_case_ref = ${lost}`;
    await hubAdmin`SELECT setval(${seqName}::regclass, ${s0}::bigint)`;

    // Tiklashdan keyin lab yangi ish oladi — hodisa yana S0+1… seq'larini oladi.
    await linkAndSendCase();
    expect(await pollUntilApplied(1)).toBeGreaterThanOrEqual(1);
  });
});

// ─── FX-98 / LB-07 ───────────────────────────────────────────────────────────
describe('Hub boshqa klasterga tiklandi — davr almashadi, kursor boshidan, dublikatsiz (FX-98)', () => {
  test('eski davr kursori yangi hodisani o‘tkazib yubormaydi; qo‘llanganlar qayta qo‘llanmaydi', async () => {
    await pollUntilApplied(0);
    const cursor = (await state()).cursor;
    expect(cursor).toMatch(/^[0-9a-f-]{36}:\d+\.\d+$/);
    const epoch = cursor.split(':')[0]!;

    const ref = await linkAndSendCase();
    const evs = (await hubAdmin`
      SELECT e.tx_id::bigint AS tx, e.seq::bigint AS seq FROM case_events e
      JOIN cases c ON c.id = e.case_id WHERE c.clinic_case_ref = ${ref}
      ORDER BY e.tx_id DESC, e.seq DESC`) as unknown as { tx: string; seq: string }[];
    expect(evs.length).toBeGreaterThanOrEqual(1);
    // Yangi klasterda xid kichik — klinikaning eski kursori yangi hodisalardan «katta».
    await setCursor(`${epoch}:${evs[0]!.tx}.${evs[0]!.seq}`);
    // `pg_restore` boshqa klasterdan: hub_meta eski klaster identifikatori bilan.
    await hubAdmin`UPDATE hub_meta SET system_identifier = '0'`;

    const applied = await pollUntilApplied(evs.length);
    // Faqat yangi ishning hodisalari — avvalgi (allaqachon qo'llangan) hodisalar dedup'da.
    expect(applied).toBe(evs.length);
    const after = (await state()).cursor;
    expect(after.split(':')[0]).not.toBe(epoch);
    expect(await pollUntilApplied(0)).toBe(0);
  });

  test('dump’dan oldin yozilgan, hali so‘ralmagan hodisalar (eski klaster xid’i) tiklashdan keyin bir marta yetadi', async () => {
    await pollUntilApplied(0);
    const epoch = (await state()).cursor.split(':')[0]!;
    // Desktop klinika o'chiq: lab ish bo'yicha hodisa yozdi, klinika so'ramadi.
    const ref = await linkAndSendCase();
    const [{ xmax }] = (await hubAdmin`
      SELECT (pg_snapshot_xmax(pg_current_snapshot())::text)::bigint AS xmax`) as unknown as {
      xmax: string;
    }[];
    // Boshqa klasterga tiklash: qatorlar eski klaster xid'i bilan (yangi hisoblagichdan katta).
    const oldTx = BigInt(xmax) + 5_000_000n;
    const evs = (await hubAdmin`
      UPDATE case_events SET tx_id = ${oldTx.toString()}::bigint
       WHERE case_id IN (SELECT id FROM cases WHERE clinic_case_ref = ${ref})
       RETURNING seq`) as unknown as { seq: string }[];
    expect(evs.length).toBeGreaterThanOrEqual(1);
    await hubAdmin`UPDATE hub_meta SET system_identifier = '0'`;
    // Klinika kursori eski klasterda shu hodisalardan oldin turgan edi.
    await setCursor(`${epoch}:${(oldTx - 1n).toString()}.0`);
    const before = await appliedCount();

    expect(await pollUntilApplied(evs.length)).toBe(evs.length);
    expect(await appliedCount()).toBe(before + evs.length);
    expect((await state()).cursor.split(':')[0]).not.toBe(epoch);
    // Qayta so'rov va yana bir davr almashishi (kursor boshidan) — ikkinchi marta qo'llanmaydi.
    expect(await pollUntilApplied(0)).toBe(0);
    await hubAdmin`UPDATE hub_meta SET system_identifier = '0'`;
    expect(await pollUntilApplied(0)).toBe(0);
    expect(await appliedCount()).toBe(before + evs.length);
  });
});
