/**
 * FX-147 (LC-25) — Electron main tiklash natijasini `<dataDir>/restore-result.json`ga yozadi,
 * lekin uni hech kim o'qimasdi: owner tiklash muvaffaqiyatsiz bo'lganini (yoki baza avvalgi
 * holatga qaytmaganini) faqat umumiy `lastError` matnidan taxmin qilardi. Endi
 * `GET /api/backup/status` `lastRestore` maydonini qaytaradi.
 *
 * REAL DB + REAL HTTP auth/RLS (Tenant Admin — egasi emas, `tenant_settings.view` bilan), real fs.
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env --timeout 30000 tests/integration/fx-147-restore-result-status.test.ts`
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OpenAPIHono } from '@hono/zod-openapi';
import { createApp } from '../../src/app.ts';
import { db } from '../../src/db/client.ts';
import { createAuditLogger } from '../../src/lib/audit-logger.ts';
import { closeRateLimitRedis } from '../../src/lib/rate-limit.ts';
import { backupRoutes } from '../../src/modules/backup/index.ts';

const dataDir = mkdtempSync(join(tmpdir(), 'fx147-backup-data-'));
const folder = join(dataDir, 'zaxira');
const resultPath = join(dataDir, 'restore-result.json');

const desktopApp = new OpenAPIHono();
desktopApp.route(
  '/api/backup',
  backupRoutes({
    db,
    audit: createAuditLogger({ db }),
    isDesktop: () => true,
    getDataDir: () => dataDir,
  }),
);

const rnd = () => `10.147.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

const call = async (
  app: { request: (u: string, i: RequestInit) => Response | Promise<Response> },
  token: string | null,
  method: string,
  path: string,
  body?: unknown,
) => {
  const res = await app.request(path, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-real-ip': rnd(),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json: { data?: Record<string, unknown> } & Record<string, any> = {};
  try {
    json = await res.json();
  } catch {}
  return { status: res.status, json };
};

const api = (token: string | null, method: string, path: string, body?: unknown) =>
  call(createApp(), token, method, `/api${path}`, body);
const status = async (token: string) => {
  const r = await call(desktopApp, token, 'GET', '/api/backup/status');
  expect(r.status).toBe(200);
  return r.json.data as Record<string, unknown>;
};

const sfx = String(Math.floor(Math.random() * 9000000) + 1000000);
const OWNER_PHONE = `+99896${sfx}`;
const OWNER_PW = 'OwnerPassword123!';
let tenantId: string;
let ownerToken: string;
let adminToken: string;

const switchTo = async (accessToken: string, refreshToken: string) => {
  const sw = await api(accessToken, 'POST', '/auth/switch-workspace', { tenantId, refreshToken });
  expect(sw.status).toBe(200);
  return sw.json.data.accessToken as string;
};

beforeAll(async () => {
  const reg = await api(null, 'POST', '/auth/register-tenant', {
    tenantName: 'FX147 Klinikasi',
    ownerPhone: OWNER_PHONE,
    ownerFullName: 'Egasi',
    ownerPassword: OWNER_PW,
  });
  expect(reg.status).toBe(201);
  const login = await api(null, 'POST', '/auth/login', { phone: OWNER_PHONE, password: OWNER_PW });
  const me = await api(login.json.data.accessToken, 'GET', '/auth/me');
  tenantId = me.json.data.ownerTenants[0].tenantId as string;
  ownerToken = await switchTo(login.json.data.accessToken, login.json.data.refreshToken);

  const roles = await api(ownerToken, 'GET', '/roles');
  const role = roles.json.data.find((r: { name: string }) => r.name === 'Tenant Admin');
  const phone = `+99897${sfx}`;
  const inv = await api(ownerToken, 'POST', '/users/invite', {
    phone,
    fullName: 'Admin',
    roleId: role.id,
  });
  expect(inv.status).toBe(201);
  const temp = inv.json.data.tempPassword as string;
  const first = await api(null, 'POST', '/auth/login', { phone, password: temp });
  const newPw = 'StaffPassword123!';
  await api(first.json.data.accessToken, 'POST', '/auth/change-password', {
    currentPassword: temp,
    newPassword: newPw,
  });
  const l2 = await api(null, 'POST', '/auth/login', { phone, password: newPw });
  adminToken = await switchTo(l2.json.data.accessToken, l2.json.data.refreshToken);

  mkdirSync(folder, { recursive: true });
  writeFileSync(join(dataDir, 'backup-settings.json'), JSON.stringify({ folder }));
});

afterAll(async () => {
  rmSync(dataDir, { recursive: true, force: true });
  await closeRateLimitRedis();
});

describe('FX-147: GET /status → lastRestore (restore-result.json)', () => {
  test('natija fayli yo‘q → lastRestore: null', async () => {
    rmSync(resultPath, { force: true });
    expect((await status(adminToken)).lastRestore).toBeNull();
  });

  test('muvaffaqiyatsiz tiklash: status/file/finishedAt/error/dbRolledBack qaytadi; lastError bilan aralashmaydi', async () => {
    writeFileSync(
      join(dataDir, 'backup-state.json'),
      JSON.stringify({ lastSuccessAt: '2026-11-18T20:00:00.000Z', lastError: null }),
    );
    writeFileSync(
      resultPath,
      JSON.stringify({
        status: 'failed',
        file: 'dental-20261110-200000',
        error: 'restore_uploads: ENOSPC — baza avvalgi holatga qaytarildi',
        dbRolledBack: true,
        finishedAt: '2026-11-19T09:00:00.000Z',
      }),
    );
    const s = await status(adminToken);
    expect(s.lastError).toBeNull();
    expect(s.lastRestore).toEqual({
      status: 'failed',
      file: 'dental-20261110-200000',
      finishedAt: '2026-11-19T09:00:00.000Z',
      error: 'restore_uploads: ENOSPC — baza avvalgi holatga qaytarildi',
      dbRolledBack: true,
    });
  });

  test('muvaffaqiyatli va jarayondagi tiklash', async () => {
    writeFileSync(
      resultPath,
      JSON.stringify({
        status: 'ok',
        file: 'dental-20261110-200000',
        finishedAt: '2026-11-19T09:05:00.000Z',
      }),
    );
    expect((await status(adminToken)).lastRestore).toEqual({
      status: 'ok',
      file: 'dental-20261110-200000',
      finishedAt: '2026-11-19T09:05:00.000Z',
      error: null,
      dbRolledBack: null,
    });
    writeFileSync(
      resultPath,
      JSON.stringify({ status: 'running', file: 'dental-20261110-200000', finishedAt: 'x' }),
    );
    expect(((await status(ownerToken)).lastRestore as { status: string }).status).toBe('running');
  });

  test('buzilgan / noma’lum status → null (UI yolg‘on banner ko‘rsatmaydi)', async () => {
    writeFileSync(resultPath, '{not json');
    expect((await status(adminToken)).lastRestore).toBeNull();
    writeFileSync(resultPath, JSON.stringify({ status: 'weird', file: 'x' }));
    expect((await status(adminToken)).lastRestore).toBeNull();
  });

  test('cloud rejimi: lastRestore null', async () => {
    const r = await api(ownerToken, 'GET', '/backup/status');
    expect(r.status).toBe(200);
    expect(r.json.data.lastRestore).toBeNull();
  });
});
