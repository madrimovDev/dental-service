/**
 * FX-23b — bot orqali yangi bron so'rovi: xodimlarga (appointment.create egalari,
 * filial qoidasi bilan) in-app bildirishnoma + bot insert audit. Real DB + RLS.
 *   cd apps/api && bun test --env-file=../../.env --timeout 30000 tests/integration/fx-23b-booking-notify.test.ts
 */
import { beforeAll, describe, expect, test } from 'bun:test';
import { ROLE_TEMPLATES } from '@dental/core';
import {
  auditLog,
  bookingRequests,
  branches,
  notifications,
  patients,
  permissions,
  rolePermissions,
  roles,
  tenants,
  userAssignments,
  users,
} from '@dental/db-schema';
import { createNoOpChannel } from '@dental/notifications';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { seedPermissions } from '../../src/db/boot-seed.ts';
import { db } from '../../src/db/client.ts';
import { withTenant } from '../../src/db/scoped.ts';
import { createAuditLogger } from '../../src/lib/audit-logger.ts';
import { createTelegramFlows } from '../../src/lib/telegram/flows.ts';
import { createAppointmentsService } from '../../src/modules/appointments/index.ts';
import { createNotificationsService } from '../../src/modules/notifications/index.ts';
import { createScheduleService } from '../../src/modules/schedule/index.ts';

const audit = createAuditLogger({ db });
const schedule = createScheduleService({ audit });
const flows = createTelegramFlows({
  appointments: createAppointmentsService({ audit, schedule }),
  schedule,
  audit,
  notifications: createNotificationsService({ sms: createNoOpChannel() }),
});

const CHAT = '7231';
let tenantId: string;
let ownerId: string;
let doctorId: string;
let recepA: string;
let recepB: string;
let accountantId: string;
let branchA: string;
let branchB: string;
let patientId: string;
const run = <T>(fn: Parameters<typeof withTenant<T>>[1]) => withTenant(tenantId, fn);

const makeRole = async (
  tx: Parameters<Parameters<typeof withTenant>[1]>[0],
  userId: string,
  templateKey: string,
  branchId: string | null,
  isPractitioner = false,
) => {
  const tpl = ROLE_TEMPLATES.find((t) => t.templateKey === templateKey)!;
  const [role] = await tx
    .insert(roles)
    .values({ tenantId, name: `${templateKey}-${userId.slice(0, 4)}`, isPractitioner })
    .returning({ id: roles.id });
  const perms = await db
    .select({ id: permissions.id })
    .from(permissions)
    .where(inArray(permissions.code, [...tpl.permissions] as string[]));
  await tx
    .insert(rolePermissions)
    .values(perms.map((p) => ({ roleId: role!.id, permissionId: p.id })));
  await tx.insert(userAssignments).values({
    userId,
    tenantId,
    roleId: role!.id,
    branchId,
    isActive: true,
    acceptedAt: new Date(),
  });
};

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  await seedPermissions(db);
  const us = await db
    .insert(users)
    .values(
      ['Owner', 'Doktor', 'RecepA', 'RecepB', 'Buxgalter'].map((n, i) => ({
        phone: `+99890002300${i}`,
        passwordHash: 'x',
        fullName: `${n} FX23b`,
      })),
    )
    .returning({ id: users.id });
  [ownerId, doctorId, recepA, recepB, accountantId] = us.map((u) => u.id) as [
    string,
    string,
    string,
    string,
    string,
  ];
  const [t] = await db
    .insert(tenants)
    .values({ name: 'FX23b', slug: 'fx23b', ownerUserId: ownerId, defaultLanguage: 'uz' })
    .returning({ id: tenants.id });
  tenantId = t!.id;
  const allDays = Object.fromEntries(
    ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].map((d) => [
      d,
      { open: '09:00', close: '18:00' },
    ]),
  );
  await run(async (tx) => {
    const [a] = await tx
      .insert(branches)
      .values({ tenantId, name: 'A filial', workHours: allDays })
      .returning({ id: branches.id });
    branchA = a!.id;
    const [b] = await tx
      .insert(branches)
      .values({ tenantId, name: 'B filial', workHours: allDays })
      .returning({ id: branches.id });
    branchB = b!.id;
    await makeRole(tx, doctorId, 'doctor', null, true);
    await makeRole(tx, recepA, 'receptionist', branchA);
    await makeRole(tx, recepB, 'receptionist', branchB);
    await makeRole(tx, accountantId, 'accountant', null);
    const [p] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'Bemor FX23b', phone: '+998902300100', telegramChatId: CHAT })
      .returning({ id: patients.id });
    patientId = p!.id;
  });
});

describe('FX-23b — bot bron so‘rovi: xodim bildirishnomasi + audit', () => {
  test('so‘rov kelganda owner + shu filial registratori xabar oladi; boshqa filial/buxgalter — yo‘q', async () => {
    await run(async (tx) => {
      // Ikki filial → avval filialni tanlaymiz (A filial — alfavit bo'yicha birinchi).
      const r1 = await flows.onCommand(tx, { tenantId, chatId: CHAT, command: 'book' });
      const b = r1.buttons?.flat().find((x) => x.text === 'A filial');
      expect(b).toBeDefined();
      const r2 = await flows.onCallback(tx, { tenantId, chatId: CHAT, data: b!.data });
      const anyDoc = r2.reply?.buttons?.flat().find((x) => x.data === 'bk:d:a');
      const r3 = await flows.onCallback(tx, { tenantId, chatId: CHAT, data: anyDoc!.data });
      const day = r3.reply?.buttons?.flat().find((x) => x.data === 'bk:t:2');
      const r4 = await flows.onCallback(tx, { tenantId, chatId: CHAT, data: day!.data });
      const slot = r4.reply?.buttons?.flat().find((x) => x.data.startsWith('bk:s:0:'));
      expect(slot).toBeDefined();
      const r5 = await flows.onCallback(tx, { tenantId, chatId: CHAT, data: slot!.data });
      expect(r5.reply?.text).toBeTruthy();
    });

    const notes = await run((tx) =>
      tx.select().from(notifications).where(eq(notifications.type, 'booking_request.new')),
    );
    const got = new Set(notes.map((n) => n.userId));
    expect(got.has(ownerId)).toBe(true);
    expect(got.has(recepA)).toBe(true);
    expect(got.has(recepB)).toBe(false);
    expect(got.has(accountantId)).toBe(false);
    // bitta so'rov — har oluvchiga bitta xabar
    expect(notes.length).toBe(got.size);
  });

  test('bot insert audit_log’ga yoziladi (userId=null, tenant, resource=booking_request)', async () => {
    const [req] = await run((tx) =>
      tx.select().from(bookingRequests).where(eq(bookingRequests.patientId, patientId)),
    );
    expect(req).toBeDefined();
    const rows = await run((tx) =>
      tx
        .select()
        .from(auditLog)
        .where(and(eq(auditLog.resourceType, 'booking_request'), eq(auditLog.resourceId, req!.id))),
    );
    expect(rows.length).toBe(1);
    expect(rows[0]!.action).toBe('created');
    expect(rows[0]!.userId).toBeNull();
    expect(rows[0]!.tenantId).toBe(tenantId);
  });
});
