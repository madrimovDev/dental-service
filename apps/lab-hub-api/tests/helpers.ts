import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import postgres from 'postgres';
import { createApp } from '../src/app';
import { loadConfig } from '../src/config';
import { createDb } from '../src/db/client';
import type { Deps } from '../src/deps';
import { createKeyring } from '../src/lib/keyring';
import { createStorage } from '../src/lib/storage';
import type { ClinicVerification, SupervisorClient } from '../src/lib/supervisor-client';

/**
 * Real-adapter test muhiti: haqiqiy Postgres (non-superuser `lab_hub_app` — RLS
 * ishlaydi), haqiqiy disk (vaqtinchalik UPLOADS_DIR). Faqat Supervisor soxta
 * (u boshqa ilova; uning verify endpoint'i supervisor-api testlarida).
 */
const uploadsDir = mkdtempSync(join(tmpdir(), 'lab-hub-test-'));
export const config = loadConfig({ ...process.env, UPLOADS_DIR: uploadsDir });

export const { db, client } = createDb(config.databaseUrl, 5);

/** Superuser ulanish — RLS'siz "xom" tekshiruv uchun (bazada ochiq ism yo'qmi). */
export const adminSql = postgres(process.env.DATABASE_ADMIN_URL!, { max: 2, onnotice: () => {} });

export const supervisorRegistry = new Map<string, ClinicVerification & { licenseKey?: string }>();
export const fakeSupervisor: SupervisorClient = {
  async verifyClinic(id, opts) {
    const c = supervisorRegistry.get(id);
    if (!c) return null;
    return { ...c, licenseMatches: !!opts.licenseKey && opts.licenseKey === c.licenseKey };
  },
};

let clock: Date | null = null;
export const setNow = (d: Date | null) => {
  clock = d;
};

export const deps: Deps = {
  db,
  config,
  keyring: createKeyring(config.kek),
  storage: createStorage(uploadsDir),
  supervisor: fakeSupervisor,
  now: () => clock ?? new Date(),
};

export const app = createApp(deps);

const json = (body: unknown) => JSON.stringify(body);
const internalHeaders = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${config.supervisorHubToken}`,
};

let phoneSeq = Math.floor(Math.random() * 9_000_000);
export const uniquePhone = () => `+99890${String(1_000_000 + (phoneSeq++ % 8_999_999)).slice(-7)}`;

export const inDays = (n: number) => new Date(Date.now() + n * 86_400_000);

export type LabCtx = { labId: string; token: string; phone: string; password: string };

/** Supervisor → Hub: lab yaratadi, lead parolini almashtiradi va token qaytaradi. */
export const createLab = async (
  over: Partial<{ name: string; expiresAt: Date; catalogVisible: boolean }> = {},
): Promise<LabCtx> => {
  const phone = uniquePhone();
  const res = await app.request('/internal/labs', {
    method: 'POST',
    headers: internalHeaders,
    body: json({
      name: over.name ?? `Lab ${crypto.randomUUID().slice(0, 8)}`,
      city: 'Toshkent',
      catalogVisible: over.catalogVisible ?? true,
      expiresAt: (over.expiresAt ?? inDays(365)).toISOString(),
      leadFullName: 'Lab Rahbari',
      leadPhone: phone,
    }),
  });
  if (res.status !== 201) throw new Error(`createLab ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { lab: { id: string }; lead: { tempPassword: string } };
  const login = await labLogin(phone, body.lead.tempPassword);
  const password = `Yangi-parol-${crypto.randomUUID().slice(0, 8)}`;
  const ch = await app.request('/v1/lab/auth/change-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${login.token}` },
    body: json({ currentPassword: body.lead.tempPassword, newPassword: password }),
  });
  if (ch.status !== 200) throw new Error(`change-password ${ch.status} ${await ch.text()}`);
  const { token } = (await ch.json()) as { token: string };
  return { labId: body.lab.id, token, phone, password };
};

export const labLogin = async (phone: string, password: string) => {
  const res = await app.request('/v1/lab/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-real-ip': crypto.randomUUID() },
    body: json({ phone, password }),
  });
  if (res.status !== 200) throw new Error(`login ${res.status} ${await res.text()}`);
  return (await res.json()) as { token: string; mustChangePassword: boolean };
};

export type ClinicCtx = { clinicId: string; supervisorClinicId: string; hubKey: string };

/** Desktop klinika: Supervisor'da ro'yxat (soxta) + Hub connect (litsenziya kaliti bilan). */
export const connectClinic = async (
  over: Partial<{ expiresAt: Date; active: boolean }> = {},
): Promise<ClinicCtx> => {
  const supervisorClinicId = crypto.randomUUID();
  const licenseKey = `K-${crypto.randomUUID()}`;
  supervisorRegistry.set(supervisorClinicId, {
    clinicId: supervisorClinicId,
    name: `Klinika ${supervisorClinicId.slice(0, 6)}`,
    mode: 'desktop',
    active: over.active ?? true,
    expiresAt: (over.expiresAt ?? inDays(365)).toISOString(),
    licenseMatches: false,
    licenseKey,
  });
  const res = await app.request('/v1/clinic/connect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-real-ip': crypto.randomUUID() },
    body: json({ supervisorClinicId, licenseKey }),
  });
  if (res.status !== 200) throw new Error(`connect ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { clinicId: string; hubKey: string };
  return { clinicId: body.clinicId, supervisorClinicId, hubKey: body.hubKey };
};

export const labReq = (lab: LabCtx, path: string, init: { method?: string; body?: unknown } = {}) =>
  app.request(path, {
    method: init.method ?? 'GET',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${lab.token}` },
    body: init.body === undefined ? undefined : json(init.body),
  });

export const clinicReq = (
  clinic: ClinicCtx,
  path: string,
  init: { method?: string; body?: unknown } = {},
) =>
  app.request(path, {
    method: init.method ?? 'GET',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${clinic.hubKey}` },
    body: init.body === undefined ? undefined : json(init.body),
  });

/** Klinika so'rov yuboradi, lab tasdiqlaydi → faol ulanish. */
export const linkActive = async (lab: LabCtx, clinic: ClinicCtx) => {
  const r = await clinicReq(clinic, '/v1/clinic/links', {
    method: 'POST',
    body: { labId: lab.labId },
  });
  if (r.status !== 200) throw new Error(`link ${r.status} ${await r.text()}`);
  const { link } = (await r.json()) as { link: { id: string } };
  const d = await labReq(lab, `/v1/lab/links/${link.id}/decision`, {
    method: 'POST',
    body: { decision: 'approve' },
  });
  if (d.status !== 200) throw new Error(`approve ${d.status} ${await d.text()}`);
};

export const caseBody = (labId: string, over: Record<string, unknown> = {}) => ({
  labId,
  patient: { fullName: 'Karimova Dilnoza Rustamovna', sex: 'female', age: 34 },
  clinicCode: 'LO-0001',
  doctorName: 'Dr. Aliyev',
  teeth: [11, 21],
  workType: 'Toj (crown)',
  material: 'Zirkoniy',
  shade: 'A2',
  dueDate: '2026-12-01',
  note: 'Bemorning tishlari sezgir',
  ...over,
});

export const sendCase = async (clinic: ClinicCtx, labId: string, ref = crypto.randomUUID()) => {
  const res = await clinicReq(clinic, `/v1/clinic/cases/${ref}`, {
    method: 'PUT',
    body: caseBody(labId),
  });
  if (res.status !== 200) throw new Error(`sendCase ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { caseId: string };
  return { ref, caseId: body.caseId };
};
