/**
 * P11 — `GET /uploads/:key` `patient_image.view` permission + audit.
 *
 * REAL DB (audit_log tenant tx'da yoziladi) + real rol shablonlari permset'i
 * (Doctor / Accountant), `@owner` EMAS.
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env --timeout 30000 p11-uploads-permission`
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const testUploadsDir = await mkdtemp(join(tmpdir(), 'p11-uploads-'));
process.env.UPLOADS_DIR = testUploadsDir;

const { ROLE_TEMPLATES } = await import('@dental/core');
const { auditLog, tenants, users } = await import('@dental/db-schema');
const { and, eq, sql } = await import('drizzle-orm');
const { db } = await import('../../src/db/client.ts');
const { createApp } = await import('../../src/app.ts');
const { createLocalStorageAdapter } = await import('../../src/lib/storage.ts');
const { signAccess } = await import('../../src/lib/jwt.ts');

const permsOf = (templateKey: string): string[] => {
  const tpl = ROLE_TEMPLATES.find((r) => r.templateKey === templateKey);
  if (!tpl) throw new Error(`template ${templateKey} yo'q`);
  return [...tpl.permissions];
};

let tenantId: string;
let userId: string;
let key: string;
const imageId = randomUUID();
const bytes = Buffer.from('p11-image-bytes');

const tokenWith = async (perms: string[]): Promise<string> => {
  const { token } = await signAccess({
    sub: userId,
    atid: tenantId,
    abid: null,
    perms,
    roleKey: null,
    lang: 'uz',
  });
  return token;
};

const auditRows = () =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    return tx
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.action, 'viewed'), eq(auditLog.resourceType, 'patient_image')));
  });

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const [u] = await db
    .insert(users)
    .values({ phone: '+998900000111', passwordHash: 'x', fullName: 'P11 Doctor' })
    .returning({ id: users.id });
  if (!u) throw new Error('user insert failed');
  userId = u.id;
  const [t] = await db
    .insert(tenants)
    .values({ name: 'P11 Clinic', slug: 'p11-clinic', ownerUserId: userId })
    .returning({ id: tenants.id });
  if (!t) throw new Error('tenant insert failed');
  tenantId = t.id;

  key = `tenants/${tenantId}/patients/${randomUUID()}/${imageId}.jpg`;
  await createLocalStorageAdapter(testUploadsDir).save(key, bytes);
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  await rm(testUploadsDir, { recursive: true, force: true });
});

describe('P11 — /uploads permission + audit', () => {
  test('Accountant (patient_image.view yo‘q) -> 403, fayl oqmaydi, audit yozilmaydi', async () => {
    const before = (await auditRows()).length;
    const app = createApp();
    const res = await app.request(`/uploads/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${await tokenWith(permsOf('accountant'))}` },
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('permission.denied');
    expect((await auditRows()).length).toBe(before);
  });

  test('Doctor -> 200 + baytlar mos + audit patient_image.viewed (resource_id = imageId)', async () => {
    const before = (await auditRows()).length;
    const app = createApp();
    const res = await app.request(`/uploads/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${await tokenWith(permsOf('doctor'))}` },
    });
    expect(res.status).toBe(200);
    expect(Buffer.from(await res.arrayBuffer()).equals(bytes)).toBe(true);

    const rows = await auditRows();
    expect(rows.length).toBe(before + 1);
    const row = rows.find((r) => (r.after as { key?: string } | null)?.key === key);
    expect(row).toBeDefined();
    expect(row?.resourceId).toBe(imageId);
    expect(row?.userId).toBe(userId);
    expect(row?.tenantId).toBe(tenantId);
  });

  test('begona tenant kaliti permission bilan ham 404 (403 emas, oshkor qilmaydi)', async () => {
    const otherKey = `tenants/${randomUUID()}/patients/${randomUUID()}/${randomUUID()}.jpg`;
    const app = createApp();
    const res = await app.request(`/uploads/${encodeURIComponent(otherKey)}`, {
      headers: { Authorization: `Bearer ${await tokenWith(permsOf('doctor'))}` },
    });
    expect(res.status).toBe(404);
  });
});
