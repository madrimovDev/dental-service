/**
 * UI-3 / D.1 — `/api/backup` (desktop zaxira): REAL DB + REAL HTTP auth/RLS, real fayl-tizimi.
 *
 * Tekshiriladi (REAL cheklangan rollar — Owner, Tenant Admin (egasi EMAS), Receptionist):
 *   - status: `tenant_settings.view` kerak (Receptionist 403); zaxira papkasi ro'yxati (nusxalar saralangan);
 *   - restore: egasi bo'lmagan 403 (Tenant Admin `tenant_settings.edit`ga ega bo'lsa ham);
 *     `confirmName` noto'g'ri -> 400; `../` va papkadan tashqari/mavjud bo'lmagan fayl -> 400;
 *     to'g'ri -> 202 + `restore-request.json` yoziladi; ikkinchisi -> 409;
 *   - settings: faqat egasi; mavjud bo'lmagan papka 400;
 *   - cloud (DENTAL_LOCAL_DESKTOP yo'q): status `mode:'cloud'`, run/restore/settings 404.
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env --timeout 30000 tests/integration/ui-backup-api.test.ts`
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OpenAPIHono } from '@hono/zod-openapi';
import { createApp } from '../../src/app.ts';
import { db } from '../../src/db/client.ts';
import { createAuditLogger } from '../../src/lib/audit-logger.ts';
import { closeRateLimitRedis } from '../../src/lib/rate-limit.ts';
import { backupRoutes } from '../../src/modules/backup/index.ts';

const dataDir = mkdtempSync(join(tmpdir(), 'ui-backup-data-'));
const folder = join(dataDir, 'zaxira');

// Desktop rejimdagi route'lar (license gate'siz — u alohida testlangan), real auth + RLS.
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

const rnd = () => `10.88.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

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
  let json: any = null;
  try {
    json = await res.json();
  } catch {}
  return { status: res.status, json };
};

const api = (token: string | null, method: string, path: string, body?: unknown) =>
  call(createApp(), token, method, `/api${path}`, body);
const backup = (token: string | null, method: string, path: string, body?: unknown) =>
  call(desktopApp, token, method, `/api/backup${path}`, body);

const sfx = String(Math.floor(Math.random() * 9000000) + 1000000);
const OWNER_PHONE = `+99891${sfx}`;
const OWNER_PW = 'OwnerPassword123!';
const CLINIC = 'Zaxira Klinikasi';

let tenantId: string;
let ownerToken: string;
let adminToken: string; // Tenant Admin — egasi emas, lekin tenant_settings.view/edit bor
let recepToken: string; // Receptionist — tenant_settings yo'q

const switchTo = async (accessToken: string, refreshToken: string) => {
  const sw = await api(accessToken, 'POST', '/auth/switch-workspace', { tenantId, refreshToken });
  expect(sw.status).toBe(200);
  return sw.json.data.accessToken as string;
};

const inviteAndLogin = async (roleName: string, phone: string): Promise<string> => {
  const roles = await api(ownerToken, 'GET', '/roles');
  const role = roles.json.data.find((r: { name: string }) => r.name === roleName);
  const inv = await api(ownerToken, 'POST', '/users/invite', {
    phone,
    fullName: roleName,
    roleId: role.id,
  });
  expect(inv.status).toBe(201);
  const temp = inv.json.data.tempPassword as string;
  const first = await api(null, 'POST', '/auth/login', { phone, password: temp });
  expect(first.status).toBe(200);
  const newPw = 'StaffPassword123!';
  const ch = await api(first.json.data.accessToken, 'POST', '/auth/change-password', {
    currentPassword: temp,
    newPassword: newPw,
  });
  expect(ch.status).toBe(200);
  const login = await api(null, 'POST', '/auth/login', { phone, password: newPw });
  expect(login.status).toBe(200);
  return switchTo(login.json.data.accessToken, login.json.data.refreshToken);
};

const makeBackup = (name: string) => {
  const dir = join(folder, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'db.dump'), 'PGDMP-fake');
  writeFileSync(join(dir, 'uploads.tar'), 'tar-fake');
};

beforeAll(async () => {
  const reg = await api(null, 'POST', '/auth/register-tenant', {
    tenantName: CLINIC,
    ownerPhone: OWNER_PHONE,
    ownerFullName: 'Egasi',
    ownerPassword: OWNER_PW,
  });
  expect(reg.status).toBe(201);
  const login = await api(null, 'POST', '/auth/login', { phone: OWNER_PHONE, password: OWNER_PW });
  const me = await api(login.json.data.accessToken, 'GET', '/auth/me');
  tenantId = me.json.data.ownerTenants[0].tenantId as string;
  ownerToken = await switchTo(login.json.data.accessToken, login.json.data.refreshToken);
  adminToken = await inviteAndLogin('Tenant Admin', `+99893${sfx}`);
  recepToken = await inviteAndLogin('Receptionist', `+99894${sfx}`);

  mkdirSync(folder, { recursive: true });
  writeFileSync(join(dataDir, 'backup-settings.json'), JSON.stringify({ folder }));
  makeBackup('dental-20261109-200000');
  makeBackup('dental-20261110-200000');
  // Zaxira bo'lmagan nomlar ro'yxatga kirmasligi kerak.
  mkdirSync(join(folder, 'pre-migrate-0.1.1-x'), { recursive: true });
});

afterAll(async () => {
  rmSync(dataDir, { recursive: true, force: true });
  await closeRateLimitRedis();
});

describe('GET /status', () => {
  test('Tenant Admin ko‘radi: papka, nusxalar yangidan eskiga', async () => {
    writeFileSync(
      join(dataDir, 'backup-state.json'),
      JSON.stringify({ lastSuccessAt: '2026-11-10T20:00:03.000Z', lastError: null }),
    );
    const r = await backup(adminToken, 'GET', '/status');
    expect(r.status).toBe(200);
    expect(r.json.data.mode).toBe('desktop');
    expect(r.json.data.folder).toBe(folder);
    expect(r.json.data.lastSuccessAt).toBe('2026-11-10T20:00:03.000Z');
    expect(r.json.data.files.map((f: { name: string }) => f.name)).toEqual([
      'dental-20261110-200000',
      'dental-20261109-200000',
    ]);
    expect(r.json.data.files[0].sizeBytes).toBe('PGDMP-fake'.length + 'tar-fake'.length);
  });

  test('Receptionist (tenant_settings.view yo‘q) 403, tokensiz 401', async () => {
    expect((await backup(recepToken, 'GET', '/status')).status).toBe(403);
    expect((await backup(null, 'GET', '/status')).status).toBe(401);
  });
});

describe('POST /restore — faqat egasi', () => {
  test('egasi bo‘lmagan 403 (tenant_settings.edit bo‘lsa ham)', async () => {
    const r = await backup(adminToken, 'POST', '/restore', {
      file: 'dental-20261110-200000',
      confirmName: CLINIC,
    });
    expect(r.status).toBe(403);
    expect(existsSync(join(dataDir, 'restore-request.json'))).toBe(false);
  });

  test('confirmName noto‘g‘ri -> 400, so‘rov fayli yozilmaydi', async () => {
    const r = await backup(ownerToken, 'POST', '/restore', {
      file: 'dental-20261110-200000',
      confirmName: 'Boshqa klinika',
    });
    expect(r.status).toBe(400);
    expect(r.json.error.code).toBe('backup.confirm_mismatch');
    expect(existsSync(join(dataDir, 'restore-request.json'))).toBe(false);
  });

  test('papkadan tashqari / mavjud bo‘lmagan fayl -> 400', async () => {
    for (const file of [
      '../etc/passwd',
      '../zaxira/dental-20261110-200000',
      '/etc/passwd',
      'dental-20261110-200000/../dental-20261109-200000',
      'dental-20990101-000000',
      'pre-migrate-0.1.1-x',
    ]) {
      const r = await backup(ownerToken, 'POST', '/restore', { file, confirmName: CLINIC });
      expect(r.status).toBe(400);
      expect(r.json.error.code).toBe('backup.file_invalid');
    }
    expect(existsSync(join(dataDir, 'restore-request.json'))).toBe(false);
  });

  test('to‘g‘ri so‘rov -> 202 va restore-request.json; ikkinchisi 409', async () => {
    const r = await backup(ownerToken, 'POST', '/restore', {
      file: 'dental-20261110-200000',
      confirmName: CLINIC,
    });
    expect(r.status).toBe(202);
    const req = JSON.parse(readFileSync(join(dataDir, 'restore-request.json'), 'utf8'));
    expect(req.file).toBe('dental-20261110-200000');
    const again = await backup(ownerToken, 'POST', '/restore', {
      file: 'dental-20261109-200000',
      confirmName: CLINIC,
    });
    expect(again.status).toBe(409);
    rmSync(join(dataDir, 'restore-request.json'));
  });
});

describe('PUT /settings va POST /run', () => {
  test('papkani faqat egasi o‘zgartiradi; mavjud bo‘lmagan papka 400', async () => {
    const other = join(dataDir, 'usb');
    mkdirSync(other);
    expect((await backup(adminToken, 'PUT', '/settings', { folder: other })).status).toBe(403);
    const missing = await backup(ownerToken, 'PUT', '/settings', {
      folder: join(dataDir, 'yoq-papka'),
    });
    expect(missing.status).toBe(400);
    expect(missing.json.error.code).toBe('backup.folder_invalid');
    const ok = await backup(ownerToken, 'PUT', '/settings', { folder: other });
    expect(ok.status).toBe(200);
    expect((await backup(ownerToken, 'GET', '/status')).json.data.folder).toBe(other);
    // Keyingi testlar uchun asl papkaga qaytaramiz.
    expect((await backup(ownerToken, 'PUT', '/settings', { folder })).status).toBe(200);
  });

  test('«Hozir zaxira olish» tenant_settings.edit bilan 202 + backup-request.json; Receptionist 403', async () => {
    expect((await backup(recepToken, 'POST', '/run')).status).toBe(403);
    const r = await backup(adminToken, 'POST', '/run');
    expect(r.status).toBe(202);
    expect(existsSync(join(dataDir, 'backup-request.json'))).toBe(true);
  });
});

describe('cloud rejimi (DENTAL_LOCAL_DESKTOP yo‘q) — haqiqiy createApp()', () => {
  test('status mode:cloud; run/restore/settings 404', async () => {
    const s = await api(ownerToken, 'GET', '/backup/status');
    expect(s.status).toBe(200);
    expect(s.json.data).toEqual({
      mode: 'cloud',
      folder: null,
      lastSuccessAt: null,
      lastError: null,
      files: [],
    });
    expect((await api(ownerToken, 'POST', '/backup/run')).status).toBe(404);
    expect(
      (
        await api(ownerToken, 'POST', '/backup/restore', {
          file: 'dental-20261110-200000',
          confirmName: CLINIC,
        })
      ).status,
    ).toBe(404);
    expect((await api(ownerToken, 'PUT', '/backup/settings', { folder: '/tmp' })).status).toBe(404);
  });
});
