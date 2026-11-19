/**
 * X-1 + FX-01 (LA-06) — recall begona ID egaligi + worker admin join tenant sharti.
 * REAL DB, real createApp(), CHEKLANGAN rol (`recall.manage` xolos — @owner EMAS).
 *
 * Postgres FK RLS'ni chetlab o'tadi: A kontekstida B bemoriga recall insert bo'ladi.
 *   cd apps/api && bun test --env-file=../../.env --timeout 30000 tests/integration/fx-01-recall-ownership.test.ts
 *
 * Arvoh qatorlarni (oldin yaratilgan, bemori boshqa tenantniki) topish uchun SQL
 * (admin ulanishda):
 *   SELECT r.id, r.tenant_id, r.patient_id FROM recalls r
 *   JOIN patients p ON p.id = r.patient_id WHERE p.tenant_id <> r.tenant_id;
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  branches,
  patients,
  recalls,
  roles,
  tenants,
  treatmentPlans,
  userAssignments,
  users,
} from '@dental/db-schema';
import { eq, sql } from 'drizzle-orm';
import { createApp } from '../../src/app.ts';
import { createAdminDb, db } from '../../src/db/client.ts';
import { withTenant } from '../../src/db/scoped.ts';
import { signAccess } from '../../src/lib/jwt.ts';
import { processRecallScan } from '../../src/lib/recall-worker.ts';

const admin = createAdminDb();

let tA: string;
let tB: string;
let staffA: string; // A klinikasi xodimi (recall.manage, owner EMAS)
let doctorA: string; // A da faol tayinlov
let doctorOnlyB: string; // faqat B da tayinlov
let patientA: string;
let patientB: string;
let branchA: string;
let branchB: string;
let planB: string;
let token: string;

const post = (body: unknown) =>
  createApp().request('/api/recalls', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
const patch = (id: string, body: unknown) =>
  createApp().request(`/api/recalls/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
const countRecalls = async (tenantId: string) =>
  (await admin.db.select().from(recalls).where(eq(recalls.tenantId, tenantId))).length;

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const mk = async (phone: string, name: string) => {
    const [u] = await db
      .insert(users)
      .values({ phone, passwordHash: 'x', fullName: name })
      .returning({ id: users.id });
    return u!.id;
  };
  const ownerA = await mk('+998900001001', 'Owner A');
  const ownerB = await mk('+998900001002', 'Owner B');
  staffA = await mk('+998900001003', 'Staff A');
  doctorA = await mk('+998900001004', 'Doctor A');
  doctorOnlyB = await mk('+998900001005', 'Doctor B');

  const mkTenant = async (slug: string, owner: string) => {
    const [t] = await db
      .insert(tenants)
      .values({ name: slug, slug, ownerUserId: owner })
      .returning({ id: tenants.id });
    return t!.id;
  };
  tA = await mkTenant('fx01-a', ownerA);
  tB = await mkTenant('fx01-b', ownerB);

  await withTenant(tA, async (tx) => {
    const [br] = await tx
      .insert(branches)
      .values({ tenantId: tA, name: 'A' })
      .returning({ id: branches.id });
    branchA = br!.id;
    const [role] = await tx
      .insert(roles)
      .values({ tenantId: tA, name: 'Recall', isSystem: false })
      .returning({ id: roles.id });
    for (const userId of [staffA, doctorA]) {
      await tx
        .insert(userAssignments)
        .values({ userId, tenantId: tA, roleId: role!.id, isActive: true });
    }
    const [p] = await tx
      .insert(patients)
      .values({ tenantId: tA, fullName: 'A bemor', phone: '+998901110001' })
      .returning({ id: patients.id });
    patientA = p!.id;
  });
  await withTenant(tB, async (tx) => {
    const [br] = await tx
      .insert(branches)
      .values({ tenantId: tB, name: 'B' })
      .returning({ id: branches.id });
    branchB = br!.id;
    const [role] = await tx
      .insert(roles)
      .values({ tenantId: tB, name: 'Doc', isSystem: false })
      .returning({ id: roles.id });
    await tx
      .insert(userAssignments)
      .values({ userId: doctorOnlyB, tenantId: tB, roleId: role!.id, isActive: true });
    const [p] = await tx
      .insert(patients)
      .values({ tenantId: tB, fullName: 'B bemor (begona)', phone: '+998901110002' })
      .returning({ id: patients.id });
    patientB = p!.id;
    const [plan] = await tx
      .insert(treatmentPlans)
      .values({ tenantId: tB, patientId: patientB, doctorId: doctorOnlyB, title: 'B plan' })
      .returning({ id: treatmentPlans.id });
    planB = plan!.id;
  });

  ({ token } = await signAccess({
    sub: staffA,
    atid: tA,
    abid: null,
    perms: ['recall.manage'],
    roleKey: null,
    lang: 'uz',
  }));
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  await admin.client.end({ timeout: 5 });
});

describe('FX-01 — recall create: begona ID → 404, qator yaratilmaydi', () => {
  test("begona patientId → 404 va arvoh qator YO'Q", async () => {
    const res = await post({ patientId: patientB, dueDate: '2026-12-01' });
    expect(res.status).toBe(404);
    expect(await countRecalls(tA)).toBe(0);
  });

  test('begona treatmentPlanId → 404', async () => {
    const res = await post({ patientId: patientA, dueDate: '2026-12-01', treatmentPlanId: planB });
    expect(res.status).toBe(404);
    expect(await countRecalls(tA)).toBe(0);
  });

  test('begona branchId → 404', async () => {
    const res = await post({ patientId: patientA, dueDate: '2026-12-01', branchId: branchB });
    expect(res.status).toBe(404);
    expect(await countRecalls(tA)).toBe(0);
  });

  test("A da tayinlovi yo'q doktor (faqat B da) → 404", async () => {
    const res = await post({
      patientId: patientA,
      dueDate: '2026-12-01',
      assignedDoctorId: doctorOnlyB,
    });
    expect(res.status).toBe(404);
    expect(await countRecalls(tA)).toBe(0);
  });

  test("o'z ID lari bilan → 201 (regressiya yo'q)", async () => {
    const res = await post({
      patientId: patientA,
      dueDate: '2026-12-01',
      branchId: branchA,
      assignedDoctorId: doctorA,
    });
    expect(res.status).toBe(201);
    expect(await countRecalls(tA)).toBe(1);
  });
});

describe("FX-01 — recall update: begona FK → 404, qator o'zgarmaydi", () => {
  test('begona branchId / assignedDoctorId bilan PATCH → 404', async () => {
    const [r] = await admin.db.select().from(recalls).where(eq(recalls.tenantId, tA));
    const r1 = await patch(r!.id, { branchId: branchB });
    expect(r1.status).toBe(404);
    const r2 = await patch(r!.id, { assignedDoctorId: doctorOnlyB });
    expect(r2.status).toBe(404);
    const [after] = await admin.db.select().from(recalls).where(eq(recalls.id, r!.id));
    expect(after!.branchId).toBe(branchA);
    expect(after!.assignedDoctorId).toBe(doctorA);
  });
});

describe('FX-01 — worker admin join: begona tenant bemoriga SMS ketmaydi', () => {
  test('arvoh recall (A, bemor B) skip; haqiqiy recall yuboriladi', async () => {
    await admin.db.delete(recalls);
    // Arvoh qator: eski kod bilan (yoki to'g'ridan-to'g'ri admin) yaratilgan.
    await admin.db.insert(recalls).values({
      tenantId: tA,
      patientId: patientB,
      reason: 'manual',
      status: 'pending',
      source: 'manual',
      dueDate: '2020-01-01',
    });
    await admin.db.insert(recalls).values({
      tenantId: tA,
      patientId: patientA,
      reason: 'manual',
      status: 'pending',
      source: 'manual',
      dueDate: '2020-01-01',
    });
    const sent: string[] = [];
    const sms = {
      send: async (to: string) => {
        sent.push(to);
        return { ok: true as const, providerId: 'm' };
      },
    };
    const res = await processRecallScan({
      adminDb: admin.db,
      withTenant,
      sms,
      now: new Date('2026-06-21T07:00:00Z'),
    } as never);
    expect(sent).not.toContain('+998901110002');
    expect(sent).toContain('+998901110001');
    expect(res.scanned).toBe(1);
    expect(res.sent).toBe(1);
  });
});
