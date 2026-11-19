/**
 * FX-109 / FX-112 / FX-121 umumiy real-DB fixture (test fayli EMAS).
 * Tenant, cheklangan rollar (Technician/Receptionist — `@owner` emas), 1 ta ESKI faol
 * (muddati o'tgan) + 24 ta yangiroq yetkazilgan lab buyurtma.
 */
import { ROLE_TEMPLATES } from '@dental/core';
import { labOrders, patients, roles, tenants, userAssignments, users } from '@dental/db-schema';
import { sql } from 'drizzle-orm';
import { db } from '../../src/db/client.ts';
import { signAccess } from '../../src/lib/jwt.ts';
import { dashboardRoutes } from '../../src/modules/dashboard/index.ts';
import { labOrdersRoutes } from '../../src/modules/lab-orders/index.ts';

export const permsOf = (key: string) => {
  const t = ROLE_TEMPLATES.find((x) => x.templateKey === key);
  if (!t) throw new Error(`${key} template not found`);
  return [...t.permissions] as string[];
};

export const withTenant = <T>(tenantId: string, fn: (tx: typeof db) => Promise<T>): Promise<T> =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    return fn(tx as unknown as typeof db);
  });

export const fx = {} as {
  tenantId: string;
  patientId: string;
  doctorId: string;
  nurseId: string;
  ownerId: string;
  outsiderId: string;
  techToken: string;
  recepToken: string;
};

const audit = { record: async () => {} };
type App = { request: (p: string, i?: RequestInit) => Response | Promise<Response> };
const caller = (app: App) => (token: string, method: string, path: string, body?: unknown) =>
  app.request(path, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
export const labCall = caller(labOrdersRoutes({ db, audit: audit as never }));
export const dashCall = caller(dashboardRoutes({ db }));

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

export async function setup(slug: string, phonePrefix: string) {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const us = await db
    .insert(users)
    .values(
      ['Owner', 'Tech', 'Recep', 'Doc', 'Nurse', 'Outsider'].map((n, i) => ({
        phone: `${phonePrefix}${i}`,
        passwordHash: 'x',
        fullName: n,
      })),
    )
    .returning({ id: users.id });
  const ids = us.map((u) => u.id) as [string, string, string, string, string, string];
  fx.ownerId = ids[0];
  fx.doctorId = ids[3];
  fx.nurseId = ids[4];
  fx.outsiderId = ids[5];

  const [t] = await db
    .insert(tenants)
    .values({ name: 'T', slug, ownerUserId: fx.ownerId })
    .returning({ id: tenants.id });
  fx.tenantId = t!.id;
  const tenantId = fx.tenantId;

  await withTenant(tenantId, async (tx) => {
    const [p] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'P1', phone: `${phonePrefix}9` })
      .returning();
    fx.patientId = p!.id;
    const [docRole] = await tx
      .insert(roles)
      .values({ tenantId, name: 'Doctor', isPractitioner: true })
      .returning();
    const [staffRole] = await tx
      .insert(roles)
      .values({ tenantId, name: 'Staff', isPractitioner: false })
      .returning();
    const now = new Date();
    const a = (userId: string, roleId: string) => ({
      userId,
      tenantId,
      roleId,
      branchId: null,
      isActive: true,
      acceptedAt: now,
    });
    await tx
      .insert(userAssignments)
      .values([
        a(fx.doctorId, docRole!.id),
        a(fx.nurseId, staffRole!.id),
        a(ids[1], staffRole!.id),
        a(ids[2], staffRole!.id),
      ]);

    const base = {
      tenantId,
      patientId: fx.patientId,
      doctorId: fx.doctorId,
      labName: 'Lab',
      orderType: 'crown' as const,
      items: [{ description: 'x' }],
    };
    await tx.insert(labOrders).values({
      ...base,
      status: 'in_progress',
      expectedDate: daysAgo(10),
      createdAt: daysAgo(21),
      notes: 'OLDEST-ACTIVE',
    });
    await tx.insert(labOrders).values(
      Array.from({ length: 24 }, (_, i) => ({
        ...base,
        status: 'delivered' as const,
        createdAt: daysAgo(5 + i / 100),
        notes: `new-${i}`,
      })),
    );
  });

  const sign = async (sub: string, key: string) =>
    (
      await signAccess({
        sub,
        atid: tenantId,
        abid: null,
        perms: permsOf(key),
        roleKey: key,
        lang: 'uz' as const,
      })
    ).token;
  fx.techToken = await sign(ids[1], 'technician');
  fx.recepToken = await sign(ids[2], 'receptionist');
}

export async function teardown() {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
}

export const createLab = (token: string, doctorId: string) =>
  labCall(token, 'POST', '/', {
    patientId: fx.patientId,
    doctorId,
    labName: 'Lab',
    orderType: 'crown',
    items: [{ description: 'Toj' }],
    shade: 'A2',
    dueDate: '2026-12-01',
  });
