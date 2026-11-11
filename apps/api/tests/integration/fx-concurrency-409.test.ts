/**
 * FU-01 — parallel so'rovlarda yutqazgan tomon 500 emas, 409 olishi shart.
 * Real `createApp()`, real HTTP, real DB, CHEKLANGAN rol (`@owner` EMAS).
 *
 * Sabab: drizzle-orm 0.45 PG xatosini `DrizzleQueryError`ga o'raydi (`.cause`da
 * asl SQLSTATE), eski `err.code` tekshiruvi hech qachon mos kelmasdi. Bundan
 * tashqari xato ushlangan tranzaksiya aborted bo'lib qoladi → insert endi
 * savepoint ichida.
 *
 * Ishga tushirish: cd apps/api && bun test --env-file=../../.env tests/integration/fx-concurrency-409.test.ts
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  appointments,
  branches,
  doctorSchedules,
  patients,
  services,
  tenants,
  users,
} from '@dental/db-schema';
import { sql } from 'drizzle-orm';
import { createApp } from '../../src/app.ts';
import { db } from '../../src/db/client.ts';
import { signAccess } from '../../src/lib/jwt.ts';
import { exclusionConflictCode } from '../../src/modules/appointments/appointments.service.ts';

let tenantId: string;
let doctorId: string;
let branchId: string;
let patientA: string;
let patientB: string;
let token: string;

const app = createApp();

const call = (method: string, path: string, body?: unknown) =>
  app.request(`/api${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const [u] = await db
    .insert(users)
    .values({ phone: '+998900007701', passwordHash: 'x', fullName: 'Dr FX' })
    .returning({ id: users.id });
  doctorId = u!.id;
  const [t] = await db
    .insert(tenants)
    .values({ name: 'FX', slug: 'fx-conc-409', ownerUserId: doctorId, defaultLanguage: 'uz' })
    .returning({ id: tenants.id });
  tenantId = t!.id;
  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    const [b] = await tx
      .insert(branches)
      .values({
        tenantId,
        name: 'B',
        workHours: {
          wed: { open: '09:00', close: '18:00' },
          thu: { open: '09:00', close: '18:00' },
        },
      })
      .returning();
    branchId = b!.id;
    // Doktor ish jadvali: 2026-12-02 = chorshanba (3), 2026-12-03 = payshanba (4).
    for (const weekday of [3, 4]) {
      await tx
        .insert(doctorSchedules)
        .values({ tenantId, branchId, doctorId, weekday, startMinute: 540, endMinute: 1080 });
    }
    const [p1] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'Ali Valiyev', phone: '+998901110001' })
      .returning();
    const [p2] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'Vali Aliyev', phone: '+998901110002' })
      .returning();
    patientA = p1!.id;
    patientB = p2!.id;
  });
  // Real cheklangan rol: faqat shu uch ruxsat.
  ({ token } = await signAccess({
    sub: doctorId,
    atid: tenantId,
    abid: branchId,
    perms: ['appointment.create', 'service.manage', 'payroll.manage'],
    roleKey: null,
    lang: 'uz',
  }));
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

const statuses = (rs: Response[]) => rs.map((r) => r.status).sort();

describe('FU-01 parallel → 409', () => {
  test('bir doktor+slot, ikki turli bemor: 201 + 409 doctor_busy (500 emas)', async () => {
    const mk = (patientId: string) =>
      call('POST', '/appointments', {
        branchId,
        patientId,
        doctorId,
        startTime: '2026-12-02T04:00:00Z',
        endTime: '2026-12-02T04:30:00Z',
      });
    const rs = await Promise.all([mk(patientA), mk(patientB)]);
    expect(statuses(rs)).toEqual([201, 409]);
    const loser = rs.find((r) => r.status === 409)!;
    const body = (await loser.json()) as { error: { code: string } };
    expect(['conflict.doctor_busy', 'conflict.slot_busy']).toContain(body.error.code);
    // Aynan 1 qator saqlangan.
    const n = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      return (await tx.select({ id: appointments.id }).from(appointments)).length;
    });
    expect(n).toBe(1);
  });

  test("FU-43: 40P01 deadlock → umumiy conflict.slot_busy; 23P01 → constraint bo'yicha", () => {
    const wrap = (code: string, constraint?: string) => ({
      cause: { code, constraint_name: constraint },
    });
    expect(exclusionConflictCode(wrap('40P01'))).toBe('conflict.slot_busy');
    expect(exclusionConflictCode(wrap('23P01', 'appointments_no_patient_overlap'))).toBe(
      'conflict.patient_busy',
    );
    expect(exclusionConflictCode(wrap('23P01', 'appointments_no_doctor_overlap'))).toBe(
      'conflict.doctor_busy',
    );
    expect(exclusionConflictCode(new Error('x'))).toBeNull();
  });

  test('6 parallel bir slotda: 1 × 201, 5 × 409', async () => {
    const rs = await Promise.all(
      Array.from({ length: 6 }, () =>
        call('POST', '/appointments', {
          branchId,
          patientId: patientA,
          doctorId,
          startTime: '2026-12-03T04:00:00Z',
          endTime: '2026-12-03T04:30:00Z',
        }),
      ),
    );
    expect(statuses(rs)).toEqual([201, 409, 409, 409, 409, 409]);
  });

  test('payroll: bir davr uchun parallel run → 201 + 409 payroll_run.overlap', async () => {
    const mk = () =>
      call('POST', '/payroll/runs', { periodFrom: '2026-10-01', periodTo: '2026-10-31' });
    const rs = await Promise.all([mk(), mk(), mk()]);
    expect(statuses(rs)).toEqual([201, 409, 409]);
    const loser = rs.find((r) => r.status === 409)!;
    expect(((await loser.json()) as { error: { code: string } }).error.code).toBe(
      'payroll_run.overlap',
    );
  });

  test('services: dublikat code parallel → 201 + 409 service.code_taken', async () => {
    const mk = () => call('POST', '/services', { code: 'DUP-1', nameUz: 'Konsultatsiya' });
    const rs = await Promise.all([mk(), mk(), mk()]);
    expect(statuses(rs)).toEqual([201, 409, 409]);
    const loser = rs.find((r) => r.status === 409)!;
    expect(((await loser.json()) as { error: { code: string } }).error.code).toBe(
      'service.code_taken',
    );
    // Ketma-ket (parallel emas) dublikat ham 409.
    const again = await mk();
    expect(again.status).toBe(409);
    const n = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      return (await tx.select({ id: services.id }).from(services)).length;
    });
    expect(n).toBe(1);
  });
});
