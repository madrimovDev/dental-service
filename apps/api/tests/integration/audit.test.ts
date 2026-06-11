import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { auditLog, tenants, users } from '@dental/db-schema';
import { sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import { createAuditService } from '../../src/modules/audit/audit.service.ts';

const service = createAuditService();
const ctx = (tx: DbOrTx): Context =>
  ({
    get: (k: string) =>
      k === 'db' ? tx : k === 'accessClaims' ? { perms: ['@owner'] } : undefined,
  }) as unknown as Context;

const RANGE = { from: '2026-06-01', to: '2026-06-30' };

let tenantAId: string;
let tenantBId: string;
let ownerAId: string;
let otherUserAId: string;

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);

  const [ownerA] = await db
    .insert(users)
    .values({ phone: '+998900000040', passwordHash: 'x', fullName: 'Owner A' })
    .returning({ id: users.id });
  ownerAId = ownerA!.id;
  const [otherA] = await db
    .insert(users)
    .values({ phone: '+998900000041', passwordHash: 'x', fullName: 'Other A' })
    .returning({ id: users.id });
  otherUserAId = otherA!.id;
  const [ownerB] = await db
    .insert(users)
    .values({ phone: '+998900000042', passwordHash: 'x', fullName: 'Owner B' })
    .returning({ id: users.id });
  const ownerBId = ownerB!.id;

  const [tenantA] = await db
    .insert(tenants)
    .values({ name: 'A', slug: 'a-clinic', ownerUserId: ownerAId })
    .returning({ id: tenants.id });
  tenantAId = tenantA!.id;
  const [tenantB] = await db
    .insert(tenants)
    .values({ name: 'B', slug: 'b-clinic', ownerUserId: ownerBId })
    .returning({ id: tenants.id });
  tenantBId = tenantB!.id;

  // Tenant A audit rows — A kontekstida (RLS WITH CHECK tenant_id = A talab qiladi)
  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantAId}'`));
    await tx.insert(auditLog).values([
      {
        tenantId: tenantAId,
        userId: ownerAId,
        action: 'created',
        resourceType: 'patient',
        createdAt: new Date('2026-06-05T09:00:00+05:00'),
      },
      {
        tenantId: tenantAId,
        userId: otherUserAId,
        action: 'updated',
        resourceType: 'patient',
        createdAt: new Date('2026-06-10T09:00:00+05:00'),
      },
      {
        tenantId: tenantAId,
        userId: ownerAId,
        action: 'deleted',
        resourceType: 'appointment',
        createdAt: new Date('2026-06-15T09:00:00+05:00'),
      },
    ]);
  });

  // Tenant B audit row — B kontekstida (cross-tenant izolyatsiya tekshiruvi uchun)
  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantBId}'`));
    await tx.insert(auditLog).values({
      tenantId: tenantBId,
      userId: ownerBId,
      action: 'created',
      resourceType: 'patient',
      createdAt: new Date('2026-06-12T09:00:00+05:00'),
    });
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

const runAs = <T>(tenantId: string, fn: (c: Context) => Promise<T>) =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    return fn(ctx(tx));
  });

describe('audit — real DB', () => {
  test('list: RLS tenant-scope — faqat joriy tenant eventlari', async () => {
    const r = await runAs(tenantAId, (c) => service.list(c, { ...RANGE, page: 1, pageSize: 50 }));
    expect(r.meta.total).toBe(3);
    expect(r.data).toHaveLength(3);
    expect(r.data.every((row) => row.tenantId === tenantAId)).toBe(true);
    // Tenant B'ning rowi ko'rinmasligi kerak
    expect(r.data.some((row) => row.tenantId === tenantBId)).toBe(false);
  });

  test('list: desc createdAt tartibi (eng yangi birinchi)', async () => {
    const r = await runAs(tenantAId, (c) => service.list(c, { ...RANGE, page: 1, pageSize: 50 }));
    const times = r.data.map((row) => new Date(row.createdAt).getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a));
    expect(r.data[0]?.action).toBe('deleted'); // 2026-06-15 eng yangi
  });

  test('list: action filtri', async () => {
    const r = await runAs(tenantAId, (c) =>
      service.list(c, { ...RANGE, action: 'created', page: 1, pageSize: 50 }),
    );
    expect(r.meta.total).toBe(1);
    expect(r.data).toHaveLength(1);
    expect(r.data[0]?.action).toBe('created');
  });

  test('list: resourceType filtri', async () => {
    const r = await runAs(tenantAId, (c) =>
      service.list(c, { ...RANGE, resourceType: 'patient', page: 1, pageSize: 50 }),
    );
    expect(r.meta.total).toBe(2);
    expect(r.data.every((row) => row.resourceType === 'patient')).toBe(true);
  });

  test('list: userId filtri', async () => {
    const r = await runAs(tenantAId, (c) =>
      service.list(c, { ...RANGE, userId: otherUserAId, page: 1, pageSize: 50 }),
    );
    expect(r.meta.total).toBe(1);
    expect(r.data[0]?.userId).toBe(otherUserAId);
  });

  test('list: from/to oraliq filtri', async () => {
    // 2026-06-08..2026-06-12 → faqat 2026-06-10 (updated) tushadi
    const r = await runAs(tenantAId, (c) =>
      service.list(c, { from: '2026-06-08', to: '2026-06-12', page: 1, pageSize: 50 }),
    );
    expect(r.meta.total).toBe(1);
    expect(r.data[0]?.action).toBe('updated');
  });

  test('list: paginatsiya (pageSize + meta)', async () => {
    const r = await runAs(tenantAId, (c) => service.list(c, { ...RANGE, page: 1, pageSize: 2 }));
    expect(r.data).toHaveLength(2);
    expect(r.meta.total).toBe(3); // total — filtr bo'yicha jami, sahifa emas
    expect(r.meta.page).toBe(1);
    expect(r.meta.pageSize).toBe(2);
  });

  test('list: tenant B kontekstida faqat B eventi', async () => {
    const r = await runAs(tenantBId, (c) => service.list(c, { ...RANGE, page: 1, pageSize: 50 }));
    expect(r.meta.total).toBe(1);
    expect(r.data[0]?.tenantId).toBe(tenantBId);
  });
});
