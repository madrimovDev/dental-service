/**
 * FX-44 (LA-42) + FX-45 (LA-41) — ombor qaytarishi ledger bo'yicha va yozilish bekorida.
 * REAL DB + REAL HTTP (createApp) + real cheklangan rollar (doktor / registrator / ombor).
 *
 * Run: cd apps/api && bun test --env-file=../../.env --timeout 30000 tests/integration/fx-44-45-stock-return.test.ts
 */
import { beforeAll, describe, expect, test } from 'bun:test';
import {
  appointments,
  branches,
  notifications,
  patientNoShowStrikes,
  patients,
  permissions,
  queueTickets,
  rolePermissions,
  roles,
  serviceMaterials,
  services,
  stockItems,
  stockMovements,
  tenants,
  userAssignments,
  users,
} from '@dental/db-schema';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { createApp } from '../../src/app.ts';
import { createAdminDb, db } from '../../src/db/client.ts';
import { signAccess } from '../../src/lib/jwt.ts';
import { processNoShowSweep } from '../../src/lib/no-show-sweep.ts';

const app = createApp();
const admin = createAdminDb();

const ROLE_PERMS = {
  doc: ['medical_record.view', 'medical_record.edit', 'appointment.view'],
  rec: ['appointment.view', 'appointment.edit', 'appointment.cancel'],
  store: ['stock.view', 'stock.manage'],
} as const;

let tenantId: string;
let branchId: string;
let patientId: string;
let docId: string;
let item: string;
let svcX: string;
let svcY: string;
const tok: Record<string, string> = {};

const call = async (who: string, method: string, path: string, body?: unknown) => {
  const res = await app.request(path, {
    method,
    headers: {
      Authorization: `Bearer ${tok[who]}`,
      'Content-Type': 'application/json',
      'x-real-ip': `10.44.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: (await res.json().catch(() => null)) as any };
};

const qty = async (id: string) =>
  Number((await admin.db.select().from(stockItems).where(eq(stockItems.id, id)))[0]!.quantity);
const setQty = (id: string, q: number) =>
  admin.db
    .update(stockItems)
    .set({ quantity: String(q) })
    .where(eq(stockItems.id, id));
const setBom = async (serviceId: string, q: number | null) => {
  await admin.db.delete(serviceMaterials).where(eq(serviceMaterials.serviceId, serviceId));
  if (q !== null) {
    const r = await call('store', 'POST', '/api/stock/bom', {
      serviceId,
      itemId: item,
      qtyPerService: q,
    });
    expect(r.status).toBe(201);
  }
};
const newNote = async (performedServices: string[], appointmentId?: string) => {
  const r = await call('doc', 'POST', '/api/visit-notes', {
    patientId,
    doctorId: docId,
    performedServices,
    appointmentId,
  });
  expect(r.status).toBe(201);
  return r.json.data.id as string;
};
let slot = 0;
const newAppt = async (status: 'scheduled' | 'in_progress' = 'in_progress') => {
  const start = new Date(Date.UTC(2031, 0, 1) + ++slot * 3_600_000);
  return (
    await admin.db
      .insert(appointments)
      .values({
        tenantId,
        branchId,
        patientId,
        doctorId: docId,
        startTime: start,
        endTime: new Date(start.getTime() + 1_800_000),
        status,
      } as never)
      .returning({ id: appointments.id })
  )[0]!.id;
};

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const mk = async (phone: string) =>
    (
      await db
        .insert(users)
        .values({ phone, passwordHash: 'x', fullName: phone })
        .returning({ id: users.id })
    )[0]!.id;
  const owner = await mk('+998900004401');
  docId = await mk('+998900004402');
  const rec = await mk('+998900004403');
  const store = await mk('+998900004404');

  const allCodes = [...new Set(Object.values(ROLE_PERMS).flat())];
  for (const code of allCodes) {
    await db
      .insert(permissions)
      .values({ code, category: code.split('.')[0]! })
      .onConflictDoNothing();
  }
  const permRows = await db
    .select({ id: permissions.id, code: permissions.code })
    .from(permissions)
    .where(inArray(permissions.code, allCodes));

  tenantId = (
    await db
      .insert(tenants)
      .values({ name: 'FX44', slug: 'fx-44-45', ownerUserId: owner })
      .returning({ id: tenants.id })
  )[0]!.id;

  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    branchId = (
      await tx.insert(branches).values({ tenantId, name: 'Asosiy' }).returning({ id: branches.id })
    )[0]!.id;
    for (const [key, uid] of [
      ['doc', docId],
      ['rec', rec],
      ['store', store],
    ] as const) {
      const [role] = await tx
        .insert(roles)
        .values({ tenantId, name: `R-${key}` })
        .returning({ id: roles.id });
      await tx
        .insert(rolePermissions)
        .values(
          permRows
            .filter((p) => (ROLE_PERMS[key] as readonly string[]).includes(p.code))
            .map((p) => ({ roleId: role!.id, permissionId: p.id })),
        );
      await tx
        .insert(userAssignments)
        .values({ tenantId, userId: uid, branchId: null, roleId: role!.id });
    }
    patientId = (
      await tx.insert(patients).values({ tenantId, fullName: 'P44' }).returning({ id: patients.id })
    )[0]!.id;
    item = (
      await tx
        .insert(stockItems)
        .values({
          tenantId,
          branchId: null,
          name: 'Anestetik',
          unit: 'dona',
          quantity: '10',
          minThreshold: '1',
        })
        .returning({ id: stockItems.id })
    )[0]!.id;
    const [x, y] = await tx
      .insert(services)
      .values([
        { tenantId, code: 'X44', nameUz: 'X' },
        { tenantId, code: 'Y44', nameUz: 'Y' },
      ])
      .returning({ id: services.id });
    svcX = x!.id;
    svcY = y!.id;
  });

  const sign = async (userId: string, perms: readonly string[]) =>
    (
      await signAccess({
        sub: userId,
        atid: tenantId,
        abid: null,
        perms: [...perms],
        roleKey: null,
        lang: 'uz',
      })
    ).token;
  tok.doc = await sign(docId, ROLE_PERMS.doc);
  tok.rec = await sign(rec, ROLE_PERMS.rec);
  tok.store = await sign(store, ROLE_PERMS.store);
});

describe('FX-44: vizit tahririda qaytarish ledger (haqiqiy chiqim) bo‘yicha', () => {
  test('BOM saqlangandan keyin 2 -> 3 ga o‘zgargan: qaytarish 2 (3 emas), fantom qoldiq yo‘q', async () => {
    await setQty(item, 10);
    await setBom(svcX, 2);
    const note = await newNote([svcX]);
    expect(await qty(item)).toBe(8);
    await setBom(svcX, 3);
    const r = await call('doc', 'PATCH', `/api/visit-notes/${note}`, { performedServices: [] });
    expect(r.status).toBe(200);
    expect(await qty(item)).toBe(10);
  });

  test('BOM butunlay o‘chirilgan: chiqqan 2 baribir qaytadi', async () => {
    await setQty(item, 10);
    await setBom(svcX, 2);
    const note = await newNote([svcX]);
    expect(await qty(item)).toBe(8);
    await setBom(svcX, null);
    await call('doc', 'PATCH', `/api/visit-notes/${note}`, { performedServices: [] });
    expect(await qty(item)).toBe(10);
  });

  test('BOM vizitdan KEYIN qo‘shilgan: olib tashlash hech narsa "qaytarmaydi"', async () => {
    await setQty(item, 10);
    await setBom(svcX, null);
    const note = await newNote([svcX]);
    expect(await qty(item)).toBe(10);
    await setBom(svcX, 5);
    await call('doc', 'PATCH', `/api/visit-notes/${note}`, { performedServices: [] });
    expect(await qty(item)).toBe(10);
  });

  test('ikki xil xizmat + takror: faqat olib tashlangan xizmat ulushi qaytadi', async () => {
    await setQty(item, 20);
    await setBom(svcX, 2);
    await setBom(svcY, 5);
    const note = await newNote([svcX, svcX, svcY]); // 2+2+5 = 9
    expect(await qty(item)).toBe(11);
    // X dan bittasini olib tashlaymiz; BOM bu orada o'zgaradi
    await setBom(svcX, 7);
    await call('doc', 'PATCH', `/api/visit-notes/${note}`, { performedServices: [svcX, svcY] });
    expect(await qty(item)).toBe(13); // +2
    await call('doc', 'PATCH', `/api/visit-notes/${note}`, { performedServices: [svcY] });
    expect(await qty(item)).toBe(15); // +2 (X ning ikkinchisi)
    await call('doc', 'PATCH', `/api/visit-notes/${note}`, { performedServices: [] });
    expect(await qty(item)).toBe(20); // +5 (Y)
  });
});

describe('FX-45: bekor qilingan yozilish ombor chiqimini qaytaradi (idempotent)', () => {
  test('qoralama vizit: yozilish bekor -> to‘liq qaytadi; qayta faollashtirib yana bekor -> ikki marta qaytmaydi', async () => {
    await setQty(item, 10);
    await setBom(svcX, 2);
    const appt = await newAppt('in_progress');
    await newNote([svcX], appt);
    expect(await qty(item)).toBe(8);
    const c1 = await call('rec', 'POST', `/api/appointments/${appt}/cancel`, { reason: 'x' });
    expect(c1.status).toBe(200);
    expect(await qty(item)).toBe(10);
    // qayta faollashtirish (ish soati guard'i bu testga aloqasiz — to'g'ridan statusni tiklaymiz)
    await admin.db
      .update(appointments)
      .set({ status: 'scheduled' })
      .where(eq(appointments.id, appt));
    const c2 = await call('rec', 'POST', `/api/appointments/${appt}/cancel`, { reason: 'y' });
    expect(c2.status).toBe(200);
    expect(await qty(item)).toBe(10);
  });

  test('imzolangan vizit + no_show: chiqim qaytadi', async () => {
    await setQty(item, 10);
    await setBom(svcX, 2);
    const appt = await newAppt('in_progress');
    const note = await newNote([svcX, svcX], appt);
    expect(await qty(item)).toBe(6);
    const sg = await call('doc', 'POST', `/api/visit-notes/${note}/sign`);
    expect(sg.status).toBe(200);
    const r = await call('rec', 'PATCH', `/api/appointments/${appt}`, { status: 'no_show' });
    expect(r.status).toBe(200);
    expect(await qty(item)).toBe(10);
    const rows = await admin.db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.sourceVisitNoteId, note));
    expect(rows.filter((m) => m.type === 'in').length).toBeGreaterThan(0);
  });

  test('vizitsiz yozilishni bekor qilish ombor harakatini yaratmaydi', async () => {
    await setQty(item, 10);
    const before = (await admin.db.select().from(stockMovements)).length;
    const appt = await newAppt('scheduled');
    expect((await call('rec', 'POST', `/api/appointments/${appt}/cancel`, {})).status).toBe(200);
    expect(await qty(item)).toBe(10);
    expect((await admin.db.select().from(stockMovements)).length).toBe(before);
  });

  test('qo‘lda "in" harakat yozilgan bo‘lsa — bekor qilishda faqat vizit chiqimi qaytadi', async () => {
    await setQty(item, 10);
    await setBom(svcX, 2);
    const appt = await newAppt('in_progress');
    await newNote([svcX], appt);
    await call('store', 'POST', '/api/stock/movements', { itemId: item, type: 'in', quantity: 5 });
    expect(await qty(item)).toBe(13);
    await call('rec', 'POST', `/api/appointments/${appt}/cancel`, {});
    expect(await qty(item)).toBe(15);
  });
});

describe('FX-45 review: avtomatik no-show sweep ishlatilgan materialni qaytarmaydi', () => {
  const pastAppt = async () => {
    const start = new Date(Date.now() - 26 * 3_600_000 - ++slot * 3_600_000);
    return (
      await admin.db
        .insert(appointments)
        .values({
          tenantId,
          branchId,
          patientId,
          doctorId: docId,
          startTime: start,
          endTime: new Date(start.getTime() + 1_800_000),
          status: 'scheduled',
        } as never)
        .returning({ id: appointments.id })
    )[0]!.id;
  };
  const apptStatus = async (id: string) =>
    (await admin.db.select().from(appointments).where(eq(appointments.id, id)))[0]!.status;
  const strikes = async (id: string) =>
    (
      await admin.db
        .select()
        .from(patientNoShowStrikes)
        .where(eq(patientNoShowStrikes.appointmentId, id))
    ).length;

  test('ticket-siz o‘tgan yozilish + imzolangan vizit: sweep tegmaydi, ombor va strike o‘zgarmaydi', async () => {
    await setQty(item, 10);
    await setBom(svcX, 1);
    const appt = await pastAppt();
    const note = await newNote([svcX], appt);
    expect(await qty(item)).toBe(9);
    expect((await call('doc', 'POST', `/api/visit-notes/${note}/sign`)).status).toBe(200);

    await processNoShowSweep({ adminDb: admin.db });

    expect(await qty(item)).toBe(9);
    expect(await apptStatus(appt)).toBe('scheduled');
    expect(await strikes(appt)).toBe(0);
    const ins = (
      await admin.db.select().from(stockMovements).where(eq(stockMovements.sourceVisitNoteId, note))
    ).filter((m) => m.type === 'in');
    expect(ins.length).toBe(0);
  });

  test('kechagi waiting ticket sweep orqali no_show bo‘lsa ham (tizim o‘tishi) ombor qaytmaydi', async () => {
    await setQty(item, 10);
    await setBom(svcX, 1);
    const appt = await pastAppt();
    await admin.db.insert(queueTickets).values({
      tenantId,
      branchId,
      patientId,
      appointmentId: appt,
      queueNumber: 1,
      status: 'waiting',
      ticketDate: new Date(Date.now() - 26 * 3_600_000),
    } as never);
    await newNote([svcX], appt);
    expect(await qty(item)).toBe(9);

    await processNoShowSweep({ adminDb: admin.db });

    expect(await apptStatus(appt)).toBe('no_show');
    expect(await qty(item)).toBe(9);
  });

  test('vizitsiz o‘tgan yozilish baribir no_show bo‘ladi (sweep ishlayveradi)', async () => {
    const appt = await pastAppt();
    await processNoShowSweep({ adminDb: admin.db });
    expect(await apptStatus(appt)).toBe('no_show');
  });
});

describe('FX-44 review: eski (belgisiz) chiqimli vizit — tahrir qaytarishidan keyin bekor ikki marta qaytarmaydi', () => {
  const untag = (note: string) =>
    admin.db
      .update(stockMovements)
      .set({ sourceServiceId: null })
      .where(eq(stockMovements.sourceVisitNoteId, note));

  test('legacy [X,Y] -> PATCH [X] -> cancel: jami 10 (11 emas)', async () => {
    await setQty(item, 10);
    await setBom(svcX, 1);
    await setBom(svcY, 1);
    const appt = await newAppt('in_progress');
    const note = await newNote([svcX, svcY], appt);
    expect(await qty(item)).toBe(8);
    await untag(note);
    const p = await call('doc', 'PATCH', `/api/visit-notes/${note}`, { performedServices: [svcX] });
    expect(p.status).toBe(200);
    expect(await qty(item)).toBe(9);
    const cn = await call('rec', 'POST', `/api/appointments/${appt}/cancel`, { reason: 'x' });
    expect(cn.status).toBe(200);
    expect(await qty(item)).toBe(10);
  });

  test('legacy [X] -> [] -> [X] (belgili) -> [] -> cancel: ortiqcha qaytarish yo‘q', async () => {
    await setQty(item, 10);
    await setBom(svcX, 1);
    await setBom(svcY, null);
    const appt = await newAppt('in_progress');
    const note = await newNote([svcX], appt);
    await untag(note);
    for (const [ps, q] of [
      [[], 10],
      [[svcX], 9],
      [[], 10],
    ] as const) {
      const r = await call('doc', 'PATCH', `/api/visit-notes/${note}`, { performedServices: ps });
      expect(r.status).toBe(200);
      expect(await qty(item)).toBe(q);
    }
    await call('rec', 'POST', `/api/appointments/${appt}/cancel`, {});
    expect(await qty(item)).toBe(10);
  });
});

describe('FX-45 review: cancelled/no_show -> scheduled qayta faollashtirish chiqimni qayta ayiradi', () => {
  // Chorshanba 11:00 Toshkent — filial ish soati ichida (API orqali qayta faollashtirish).
  let day = 0;
  beforeAll(async () => {
    const allDays = Object.fromEntries(
      ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [
        d,
        { open: '00:00', close: '23:59' },
      ]),
    );
    await admin.db.update(branches).set({ workHours: allDays }).where(eq(branches.id, branchId));
    // jadvalsiz doktor filial ish soatiga fallback qiladi — faqat practitioner rolda
    await admin.db
      .update(roles)
      .set({ isPractitioner: true })
      .where(sql`${roles.tenantId} = ${tenantId} and ${roles.name} = 'R-doc'`);
    // to'g'ridan yozilgan tayinlov qabul qilingan bo'lishi shart
    await admin.db
      .update(userAssignments)
      .set({ acceptedAt: new Date() })
      .where(eq(userAssignments.userId, docId));
  });
  const inHoursAppt = async () => {
    const start = new Date(Date.UTC(2031, 0, 8 + 7 * ++day, 6, 0));
    return (
      await admin.db
        .insert(appointments)
        .values({
          tenantId,
          branchId,
          patientId,
          doctorId: docId,
          startTime: start,
          endTime: new Date(start.getTime() + 1_800_000),
          status: 'in_progress',
        } as never)
        .returning({ id: appointments.id })
    )[0]!.id;
  };

  test('qoralama 2 dona -> no_show -> scheduled -> PATCH + imzo: qoldiq 8', async () => {
    await setQty(item, 10);
    await setBom(svcX, 2);
    await setBom(svcY, null);
    const appt = await inHoursAppt();
    const note = await newNote([svcX], appt);
    expect(await qty(item)).toBe(8);
    expect(
      (await call('rec', 'PATCH', `/api/appointments/${appt}`, { status: 'no_show' })).status,
    ).toBe(200);
    expect(await qty(item)).toBe(10);
    const re = await call('rec', 'PATCH', `/api/appointments/${appt}`, { status: 'scheduled' });
    expect(re.json).toMatchObject({ data: { status: 'scheduled' } });
    expect(await qty(item)).toBe(8);
    expect(
      (await call('doc', 'PATCH', `/api/visit-notes/${note}`, { performedServices: [svcX] }))
        .status,
    ).toBe(200);
    expect((await call('doc', 'POST', `/api/visit-notes/${note}/sign`)).status).toBe(200);
    expect(await qty(item)).toBe(8);
    const rows = await admin.db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.sourceVisitNoteId, note));
    const net = rows.reduce((s, m) => s + (m.type === 'out' ? 1 : -1) * Number(m.quantity), 0);
    expect(net).toBe(2);
  });

  test('takroriy bekor/qayta faollashtirish sikli: har safar to‘g‘ri, keyin tahrir qaytarishi ham to‘g‘ri', async () => {
    await setQty(item, 20);
    await setBom(svcX, 2);
    const appt = await inHoursAppt();
    const note = await newNote([svcX, svcX], appt);
    expect(await qty(item)).toBe(16);
    for (let i = 0; i < 2; i++) {
      expect((await call('rec', 'POST', `/api/appointments/${appt}/cancel`, {})).status).toBe(200);
      expect(await qty(item)).toBe(20);
      expect(
        (await call('rec', 'PATCH', `/api/appointments/${appt}`, { status: 'scheduled' })).status,
      ).toBe(200);
      expect(await qty(item)).toBe(16);
    }
    // bitta X olib tashlansa — bitta occurrence ulushi (2) qaytadi
    await call('doc', 'PATCH', `/api/visit-notes/${note}`, { performedServices: [svcX] });
    expect(await qty(item)).toBe(18);
  });

  test('seam: qayta ayirish qoldiqni chegaradan pastga tushirsa — low-stock alert (stock.manage)', async () => {
    const [storeUser] = await admin.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.phone, '+998900004404'));
    const lowAlerts = async () =>
      (
        await admin.db
          .select({ params: notifications.params })
          .from(notifications)
          .where(
            and(
              eq(notifications.userId, storeUser!.id),
              eq(notifications.type, 'stock.low_threshold'),
            ),
          )
      ).filter((n) => (n.params as { itemId?: string } | null)?.itemId === item).length;

    await setQty(item, 2); // min 1 — past emas
    await setBom(svcX, 2);
    const appt = await inHoursAppt();
    await newNote([svcX], appt);
    expect(await qty(item)).toBe(0);
    expect((await call('rec', 'POST', `/api/appointments/${appt}/cancel`, {})).status).toBe(200);
    expect(await qty(item)).toBe(2);
    const before = await lowAlerts();
    expect(
      (await call('rec', 'PATCH', `/api/appointments/${appt}`, { status: 'scheduled' })).status,
    ).toBe(200);
    expect(await qty(item)).toBe(0);
    expect(await lowAlerts()).toBe(before + 1);
  });
});
