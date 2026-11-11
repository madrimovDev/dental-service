/**
 * UI-D1 `GET /api/dashboard/doctor-pending` (REAL HTTP + REAL DB + REAL rol permset, @owner EMAS).
 *  - Doctor: faqat O'ZINING imzolanmagan vizitlari / rejalari; boshqa shifokorniki ko'rinmaydi.
 *  - Receptionist (`medical_record.view` yo'q) → 403.
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env ui-d1-doctor-pending`
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { ROLE_TEMPLATES } from '@dental/core';
import {
  appointments,
  branches,
  patientImages,
  patients,
  tenants,
  treatmentPlans,
  users,
  visitNotes,
} from '@dental/db-schema';
import { sql } from 'drizzle-orm';
import { createApp } from '../../src/app.ts';
import { db } from '../../src/db/client.ts';
import { signAccess } from '../../src/lib/jwt.ts';

const permsFor = (k: string): string[] => {
  const t = ROLE_TEMPLATES.find((x) => x.templateKey === k);
  if (!t) throw new Error(`template ${k}`);
  return [...t.permissions];
};

let tenantId: string;
let doctorId: string;
let otherDoctorId: string;
let receptionistId: string;

const tokenFor = async (sub: string, perms: string[], roleKey: string) =>
  (await signAccess({ sub, atid: tenantId, abid: null, perms, roleKey, lang: 'uz' })).token;

const get = (token: string) =>
  createApp().request('/api/dashboard/doctor-pending', {
    headers: { authorization: `Bearer ${token}` },
  });

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const ins = await db
    .insert(users)
    .values([
      { phone: '+998900005101', passwordHash: 'x', fullName: 'Owner' },
      { phone: '+998900005102', passwordHash: 'x', fullName: 'Doctor Own' },
      { phone: '+998900005103', passwordHash: 'x', fullName: 'Doctor Other' },
      { phone: '+998900005104', passwordHash: 'x', fullName: 'Reception' },
    ])
    .returning({ id: users.id });
  const [owner, d1, d2, r] = ins;
  if (!owner || !d1 || !d2 || !r) throw new Error('users');
  doctorId = d1.id;
  otherDoctorId = d2.id;
  receptionistId = r.id;
  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'D1', slug: 'ui-d1', ownerUserId: owner.id })
    .returning({ id: tenants.id });
  tenantId = tenant!.id;

  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    const [b] = await tx.insert(branches).values({ tenantId, name: 'B' }).returning();
    const branchId = b!.id;
    const [p] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'Bemor D1' })
      .returning({ id: patients.id });
    const patientId = p!.id;
    const recent = (h: number) => new Date(Date.now() - h * 3_600_000);
    const mkAppt = async (docId: string, hoursAgo: number, status: 'completed' | 'scheduled') => {
      const [a] = await tx
        .insert(appointments)
        .values({
          tenantId,
          branchId,
          patientId,
          doctorId: docId,
          startTime: recent(hoursAgo),
          endTime: recent(hoursAgo - 0.5),
          status,
        })
        .returning({ id: appointments.id });
      return a!.id;
    };
    // O'zimniki: 2 tugagan (1 tasi vizit yozuvli) + boshqa shifokorniki 1 tugagan (yozuvsiz).
    const own1 = await mkAppt(doctorId, 30, 'completed');
    await mkAppt(doctorId, 28, 'completed');
    await mkAppt(otherDoctorId, 26, 'completed');
    await tx
      .insert(visitNotes)
      .values({ tenantId, patientId, doctorId, appointmentId: own1, subjective: 'x' });
    // Rasm: boshqa xodim yuklagan (ko'rilmagan) + shifokorning o'zi yuklagan (hisoblanmaydi).
    await tx.insert(patientImages).values([
      {
        tenantId,
        patientId,
        uploadedByUserId: receptionistId,
        type: 'other',
        objectKey: `tenants/${tenantId}/patients/${patientId}/a.png`,
        originalFilename: 'a.png',
        contentType: 'image/png',
        sizeBytes: 1,
      },
      {
        tenantId,
        patientId,
        uploadedByUserId: doctorId,
        type: 'other',
        objectKey: `tenants/${tenantId}/patients/${patientId}/b.png`,
        originalFilename: 'b.png',
        contentType: 'image/png',
        sizeBytes: 1,
      },
    ]);
    await tx.insert(treatmentPlans).values([
      { tenantId, patientId, doctorId, title: 'Reja 1', status: 'presented' },
      { tenantId, patientId, doctorId, title: 'Reja 2', status: 'draft' },
      { tenantId, patientId, doctorId: otherDoctorId, title: 'Begona', status: 'presented' },
    ]);
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('GET /api/dashboard/doctor-pending', () => {
  test("Doctor faqat o'zining kutilayotgan ishlarini ko'radi", async () => {
    const res = await get(await tokenFor(doctorId, permsFor('doctor'), 'doctor'));
    expect(res.status).toBe(200);
    const { data } = (await res.json()) as { data: Record<string, any> };
    expect(data.unsignedVisitNotes.count).toBe(1);
    expect(data.unsignedVisitNotes.items).toHaveLength(1);
    expect(data.unsignedVisitNotes.items[0].patientName).toBe('Bemor D1');
    expect(data.unreviewedImages.count).toBe(1);
    expect(data.plansAwaitingResponse.count).toBe(1);
    expect(data.plansAwaitingResponse.oldestDays).toBe(0);
  });

  test("Boshqa shifokorda faqat o'zinikilari (begona reja/yozilish aralashmaydi)", async () => {
    const res = await get(await tokenFor(otherDoctorId, permsFor('doctor'), 'doctor'));
    const { data } = (await res.json()) as { data: Record<string, any> };
    expect(data.unsignedVisitNotes.count).toBe(1);
    expect(data.plansAwaitingResponse.count).toBe(1);
    // Rasm: bemor shu shifokorniki ham (yozilishi bor) — rasm kimniki bo'lishidan qat'i nazar bemor bo'yicha.
    expect(data.unreviewedImages.count).toBe(2);
  });

  test('Receptionist (medical_record.view yo`q) → 403', async () => {
    const res = await get(await tokenFor(receptionistId, permsFor('receptionist'), 'receptionist'));
    expect(res.status).toBe(403);
  });
});
