/**
 * FX-90 — zaxira/tiklash so'rov fayli audit yozuvidan OLDIN diskka yozilardi: audit yiqilsa
 * (500 -> rlsMiddleware rollback) Electron main baribir tiklashni/zaxirani bajarardi, lekin
 * audit_log'da izi qolmasdi. Endi audit avval yoziladi; audit yiqilsa so'rov fayli yozilmaydi.
 *
 * REAL DB + REAL HTTP auth/RLS, real fayl-tizimi. Audit logger real (DB'ga yozadi), faqat
 * `backup.*` amallarida xato tashlaydigan qilib o'ralgan — audit yozuvi yiqilishini simulyatsiya.
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env --timeout 30000 tests/integration/fx-90-backup-audit-before-file.test.ts`
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { auditLog } from '@dental/db-schema';
import { OpenAPIHono } from '@hono/zod-openapi';
import { and, eq } from 'drizzle-orm';
import { createApp } from '../../src/app.ts';
import { createAdminDb, db } from '../../src/db/client.ts';
import { type AuditLogger, createAuditLogger } from '../../src/lib/audit-logger.ts';
import { closeRateLimitRedis } from '../../src/lib/rate-limit.ts';
import { backupRoutes } from '../../src/modules/backup/index.ts';

const admin = createAdminDb();
const dataDir = mkdtempSync(join(tmpdir(), 'fx90-backup-data-'));
const folder = join(dataDir, 'zaxira');
const otherFolder = join(dataDir, 'usb');

const realAudit = createAuditLogger({ db });
let auditFails = false;
const flakyAudit: AuditLogger = {
  record: async (c, entry) => {
    if (auditFails && entry.action.startsWith('backup.')) {
      throw new Error('audit_log insert failed (simulated)');
    }
    return realAudit.record(c, entry);
  },
};

const desktopApp = new OpenAPIHono();
desktopApp.route(
  '/api/backup',
  backupRoutes({ db, audit: flakyAudit, isDesktop: () => true, getDataDir: () => dataDir }),
);

const rnd = () => `10.90.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

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
const OWNER_PHONE = `+99895${sfx}`;
const OWNER_PW = 'OwnerPassword123!';
const CLINIC = 'FX90 Klinikasi';
let tenantId: string;
let ownerToken: string;

const auditCount = async (action: string) =>
  (
    await admin.db
      .select({ id: auditLog.id })
      .from(auditLog)
      .where(and(eq(auditLog.tenantId, tenantId), eq(auditLog.action, action)))
  ).length;

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
  const sw = await api(login.json.data.accessToken, 'POST', '/auth/switch-workspace', {
    tenantId,
    refreshToken: login.json.data.refreshToken,
  });
  expect(sw.status).toBe(200);
  ownerToken = sw.json.data.accessToken as string;

  mkdirSync(folder, { recursive: true });
  mkdirSync(otherFolder, { recursive: true });
  writeFileSync(join(dataDir, 'backup-settings.json'), JSON.stringify({ folder }));
  const dir = join(folder, 'dental-20261110-200000');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'db.dump'), 'PGDMP-fake');
});

afterAll(async () => {
  rmSync(dataDir, { recursive: true, force: true });
  await closeRateLimitRedis();
  await admin.client.end({ timeout: 5 });
});

describe('FX-90: audit yiqilsa so‘rov fayli yozilmaydi', () => {
  test('restore: audit xatosi -> 500, restore-request.json YO‘Q, audit yozuvi yo‘q', async () => {
    auditFails = true;
    try {
      const r = await backup(ownerToken, 'POST', '/restore', {
        file: 'dental-20261110-200000',
        confirmName: CLINIC,
      });
      expect(r.status).toBe(500);
    } finally {
      auditFails = false;
    }
    expect(existsSync(join(dataDir, 'restore-request.json'))).toBe(false);
    expect(await auditCount('backup.restore_requested')).toBe(0);
  });

  test('run: audit xatosi -> 500, backup-request.json YO‘Q', async () => {
    auditFails = true;
    try {
      expect((await backup(ownerToken, 'POST', '/run')).status).toBe(500);
    } finally {
      auditFails = false;
    }
    expect(existsSync(join(dataDir, 'backup-request.json'))).toBe(false);
  });

  test('settings: audit xatosi -> 500, papka o‘zgarmaydi', async () => {
    auditFails = true;
    try {
      const r = await backup(ownerToken, 'PUT', '/settings', { folder: otherFolder });
      expect(r.status).toBe(500);
    } finally {
      auditFails = false;
    }
    const saved = JSON.parse(readFileSync(join(dataDir, 'backup-settings.json'), 'utf8'));
    expect(saved.folder).toBe(folder);
  });

  test('audit ishlasa: 202 + fayl + audit_log yozuvi (commit)', async () => {
    const r = await backup(ownerToken, 'POST', '/restore', {
      file: 'dental-20261110-200000',
      confirmName: CLINIC,
    });
    expect(r.status).toBe(202);
    expect(existsSync(join(dataDir, 'restore-request.json'))).toBe(true);
    expect(await auditCount('backup.restore_requested')).toBe(1);
  });
});
