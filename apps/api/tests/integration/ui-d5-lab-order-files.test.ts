/**
 * UI-D5 — Lab buyurtma: majburiy `shade` + `dueDate`, remake, fayllar (`lab_order_files`)
 * va `/uploads` prefiks qoidasi (`lab-orders/` → `lab_order.view`).
 *
 * REAL DB (RLS, audit) + real local-storage adapter + real rol shablonlari permset'i
 * (Doctor / Nurse / Accountant / Technician) — `@owner` EMAS.
 *
 * Ishga tushirish:
 *   cd apps/api && bun test --env-file=../../.env --timeout 30000 ui-d5-lab-order-files
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// `app.ts` storage adapterini modul yuklanganda `UPLOADS_DIR` bilan bir marta yaratadi —
// to'liq to'plamda boshqa fayl uni oldinroq yuklagan bo'lsa o'sha katalog ishlatiladi.
// Shuning uchun mavjud qiymatni qayta ishlatamiz (aks holda test boshqa katalogni tekshiradi).
const testUploadsDir = process.env.UPLOADS_DIR ?? (await mkdtemp(join(tmpdir(), 'ui-d5-uploads-')));
process.env.UPLOADS_DIR = testUploadsDir;

const { ROLE_TEMPLATES } = await import('@dental/core');
const { auditLog, labOrderFiles, patients, tenants, users } = await import('@dental/db-schema');
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

let tenantA: string;
let tenantB: string;
let userId: string;
let patientA: string;
let patientA2: string;
let patientB: string;

const tokenFor = async (tenantId: string, perms: string[]): Promise<string> => {
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

const asDoctor = () => tokenFor(tenantA, permsOf('doctor'));
const asNurse = () => tokenFor(tenantA, permsOf('nurse'));

const json = (token: string, method: string, path: string, body?: unknown) =>
  createApp().request(path, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const validBody = (over: Record<string, unknown> = {}) => ({
  patientId: patientA,
  doctorId: userId,
  labName: 'Oq Tish',
  orderType: 'bridge',
  items: [{ description: "Ko'prik 34–36", toothNumbers: [34, 35, 36], material: 'zirconia' }],
  shade: 'A3',
  dueDate: '2026-11-18',
  ...over,
});

const createOrder = async (over: Record<string, unknown> = {}) => {
  const res = await json(await asDoctor(), 'POST', '/api/lab-orders', validBody(over));
  expect(res.status).toBe(201);
  return ((await res.json()) as { data: { id: string } }).data;
};

const uploadFile = (token: string, orderId: string, file: File, label?: string) => {
  const fd = new FormData();
  fd.set('file', file);
  if (label) fd.set('label', label);
  return createApp().request(`/api/lab-orders/${orderId}/files`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
};

const fileRows = (tenantId: string) =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    return tx.select().from(labOrderFiles);
  });

const auditCount = (tenantId: string, resourceType: string, action: string) =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    const rows = await tx
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.action, action), eq(auditLog.resourceType, resourceType)));
    return rows.length;
  });

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const [u] = await db
    .insert(users)
    .values({ phone: '+998900000555', passwordHash: 'x', fullName: 'D5 Doctor' })
    .returning({ id: users.id });
  if (!u) throw new Error('user insert failed');
  userId = u.id;

  const [a] = await db
    .insert(tenants)
    .values({ name: 'D5 Clinic A', slug: 'd5-clinic-a', ownerUserId: userId })
    .returning({ id: tenants.id });
  const [b] = await db
    .insert(tenants)
    .values({ name: 'D5 Clinic B', slug: 'd5-clinic-b', ownerUserId: userId })
    .returning({ id: tenants.id });
  if (!a || !b) throw new Error('tenant insert failed');
  tenantA = a.id;
  tenantB = b.id;

  const mk = async (tenantId: string, fullName: string) =>
    db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      const [p] = await tx
        .insert(patients)
        .values({ tenantId, fullName })
        .returning({ id: patients.id });
      if (!p) throw new Error('patient insert failed');
      return p.id;
    });
  patientA = await mk(tenantA, 'Bemor A');
  patientA2 = await mk(tenantA, 'Bemor A2');
  patientB = await mk(tenantB, 'Bemor B');
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  await rm(testUploadsDir, { recursive: true, force: true });
});

describe('UI-D5 — yangi buyurtmada shade + dueDate majburiy', () => {
  test('shade yo‘q -> 400', async () => {
    const res = await json(
      await asDoctor(),
      'POST',
      '/api/lab-orders',
      validBody({ shade: undefined }),
    );
    expect(res.status).toBe(400);
  });

  test('dueDate yo‘q -> 400', async () => {
    const res = await json(
      await asDoctor(),
      'POST',
      '/api/lab-orders',
      validBody({ dueDate: undefined }),
    );
    expect(res.status).toBe(400);
  });

  test('dueDate noto‘g‘ri format -> 400', async () => {
    const res = await json(
      await asDoctor(),
      'POST',
      '/api/lab-orders',
      validBody({ dueDate: '18.11.2026' }),
    );
    expect(res.status).toBe(400);
  });

  test('ikkalasi bilan -> 201, DTO shade/dueDate + expectedDate muddatdan hosil bo‘ladi', async () => {
    const res = await json(await asDoctor(), 'POST', '/api/lab-orders', validBody());
    expect(res.status).toBe(201);
    const { data } = (await res.json()) as {
      data: {
        shade: string;
        dueDate: string;
        expectedDate: string | null;
        remakeOfId: string | null;
        remakeReason: string | null;
      };
    };
    expect(data.shade).toBe('A3');
    expect(data.dueDate).toBe('2026-11-18');
    expect(data.expectedDate).not.toBeNull();
    expect(data.remakeOfId).toBeNull();
    expect(data.remakeReason).toBeNull();
  });
});

describe('UI-D5 — remake', () => {
  test('remakeOfId + sabab -> 201', async () => {
    const orig = await createOrder();
    const res = await json(
      await asDoctor(),
      'POST',
      '/api/lab-orders',
      validBody({ remakeOfId: orig.id, remakeReason: 'shade' }),
    );
    expect(res.status).toBe(201);
    const { data } = (await res.json()) as {
      data: { remakeOfId: string; remakeReason: string };
    };
    expect(data.remakeOfId).toBe(orig.id);
    expect(data.remakeReason).toBe('shade');
  });

  test('sababsiz remakeOfId -> 400; remakeOfIdsiz sabab -> 400; noma‘lum sabab -> 400', async () => {
    const orig = await createOrder();
    const t = await asDoctor();
    expect(
      (await json(t, 'POST', '/api/lab-orders', validBody({ remakeOfId: orig.id }))).status,
    ).toBe(400);
    expect(
      (await json(t, 'POST', '/api/lab-orders', validBody({ remakeReason: 'shade' }))).status,
    ).toBe(400);
    expect(
      (
        await json(
          t,
          'POST',
          '/api/lab-orders',
          validBody({ remakeOfId: orig.id, remakeReason: 'bad_code' }),
        )
      ).status,
    ).toBe(400);
  });

  test('boshqa bemorning buyurtmasini remake qilib bo‘lmaydi -> 400', async () => {
    const orig = await createOrder({ patientId: patientA2 });
    const res = await json(
      await asDoctor(),
      'POST',
      '/api/lab-orders',
      validBody({ remakeOfId: orig.id, remakeReason: 'margin' }),
    );
    expect(res.status).toBe(400);
  });

  test('mavjud bo‘lmagan remakeOfId -> 400', async () => {
    const res = await json(
      await asDoctor(),
      'POST',
      '/api/lab-orders',
      validBody({ remakeOfId: randomUUID(), remakeReason: 'other' }),
    );
    expect(res.status).toBe(400);
  });
});

describe('UI-D5 — fayllar', () => {
  test('lab_order.manage yo‘q (Nurse) yuklay olmaydi -> 403; yuklash yozilmaydi', async () => {
    const order = await createOrder();
    const before = (await fileRows(tenantA)).length;
    const res = await uploadFile(
      await asNurse(),
      order.id,
      new File([new Uint8Array([1, 2, 3])], 'scan.stl', { type: 'model/stl' }),
    );
    expect(res.status).toBe(403);
    expect((await fileRows(tenantA)).length).toBe(before);
  });

  test('Doctor yuklaydi -> 201 + DB qator + storage + audit; Nurse ro‘yxatni ko‘radi, o‘chira olmaydi', async () => {
    const order = await createOrder();
    const bytes = Buffer.from('shade-guide-photo');
    const auditBefore = await auditCount(tenantA, 'lab_order_file', 'uploaded');
    const res = await uploadFile(
      await asDoctor(),
      order.id,
      new File([bytes], 'shade.jpg', { type: 'image/jpeg' }),
      'Rang shkalasi bilan surat',
    );
    expect(res.status).toBe(201);
    const { data: file } = (await res.json()) as {
      data: { id: string; url: string; label: string | null; originalFilename: string };
    };
    expect(file.originalFilename).toBe('shade.jpg');
    expect(file.label).toBe('Rang shkalasi bilan surat');
    expect(file.url.startsWith('/uploads/')).toBe(true);
    expect(await auditCount(tenantA, 'lab_order_file', 'uploaded')).toBe(auditBefore + 1);

    const rows = await fileRows(tenantA);
    const row = rows.find((r) => r.id === file.id);
    expect(row?.objectKey).toBe(`tenants/${tenantA}/lab-orders/${order.id}/${file.id}.jpg`);
    expect(await createLocalStorageAdapter(testUploadsDir).exists(row?.objectKey ?? '')).toBe(true);

    const list = await json(await asNurse(), 'GET', `/api/lab-orders/${order.id}/files`);
    expect(list.status).toBe(200);
    const listed = (await list.json()) as { data: { id: string }[] };
    expect(listed.data.map((f) => f.id)).toContain(file.id);

    const del403 = await json(
      await asNurse(),
      'DELETE',
      `/api/lab-orders/${order.id}/files/${file.id}`,
    );
    expect(del403.status).toBe(403);

    const del = await json(
      await asDoctor(),
      'DELETE',
      `/api/lab-orders/${order.id}/files/${file.id}`,
    );
    expect(del.status).toBe(200);
    expect((await fileRows(tenantA)).some((r) => r.id === file.id)).toBe(false);
    expect(await createLocalStorageAdapter(testUploadsDir).exists(row?.objectKey ?? '')).toBe(
      false,
    );
  });

  test('ruxsat etilmagan turi -> 415; fayl yo‘q -> 400', async () => {
    const order = await createOrder();
    const t = await asDoctor();
    const bad = await uploadFile(
      t,
      order.id,
      new File(['x'], 'run.exe', { type: 'application/x-msdownload' }),
    );
    expect(bad.status).toBe(415);
    const none = await createApp().request(`/api/lab-orders/${order.id}/files`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${t}` },
      body: new FormData(),
    });
    expect(none.status).toBe(400);
  });

  test('boshqa tenant buyurtmasiga yuklab bo‘lmaydi (RLS) -> 404', async () => {
    const order = await createOrder();
    const res = await uploadFile(
      await tokenFor(tenantB, permsOf('doctor')),
      order.id,
      new File(['x'], 'a.jpg', { type: 'image/jpeg' }),
    );
    expect(res.status).toBe(404);
  });
});

describe('UI-D5 — /uploads prefiks qoidasi', () => {
  let labKey: string;
  let fileId: string;
  const bytes = Buffer.from('lab-file-bytes');

  beforeAll(async () => {
    const order = await createOrder();
    const res = await uploadFile(
      await asDoctor(),
      order.id,
      new File([bytes], 'scan.pdf', { type: 'application/pdf' }),
    );
    expect(res.status).toBe(201);
    const { data } = (await res.json()) as { data: { id: string; url: string } };
    fileId = data.id;
    labKey = `tenants/${tenantA}/lab-orders/${order.id}/${fileId}.pdf`;
    expect(decodeURIComponent(data.url)).toBe(`/uploads/${labKey}`);
  });

  const get = async (token: string, key: string) =>
    createApp().request(`/uploads/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

  test('lab_order.view yo‘q (Accountant) lab fayli -> 403', async () => {
    const res = await get(await tokenFor(tenantA, permsOf('accountant')), labKey);
    expect(res.status).toBe(403);
  });

  test('lab_order.view bilan (Doctor) -> 200, baytlar mos, audit lab_order_file.viewed', async () => {
    const before = await auditCount(tenantA, 'lab_order_file', 'viewed');
    const res = await get(await asDoctor(), labKey);
    expect(res.status).toBe(200);
    expect(Buffer.from(await res.arrayBuffer()).equals(bytes)).toBe(true);
    expect(await auditCount(tenantA, 'lab_order_file', 'viewed')).toBe(before + 1);
  });

  test('Technician (faqat lab_order.*) lab faylini ko‘radi, bemor rasmini ko‘ra olmaydi', async () => {
    const tech = await tokenFor(tenantA, permsOf('technician'));
    expect((await get(tech, labKey)).status).toBe(200);
    const patientKey = `tenants/${tenantA}/patients/${patientA}/${randomUUID()}.jpg`;
    await createLocalStorageAdapter(testUploadsDir).save(patientKey, Buffer.from('img'));
    expect((await get(tech, patientKey)).status).toBe(403);
    // Doctor (patient_image.view bor) bemor rasmini ko‘radi — oldingi xulq saqlangan.
    expect((await get(await asDoctor(), patientKey)).status).toBe(200);
  });

  test('begona prefiks (o‘z tenanti) -> 403 hatto Doctor uchun ham', async () => {
    const odd = `tenants/${tenantA}/exports/${randomUUID()}.csv`;
    await createLocalStorageAdapter(testUploadsDir).save(odd, Buffer.from('a,b'));
    expect((await get(await asDoctor(), odd)).status).toBe(403);
  });

  test('boshqa tenant foydalanuvchisi lab faylini ololmaydi', async () => {
    const res = await get(await tokenFor(tenantB, permsOf('doctor')), labKey);
    // Cross-tenant mavjudligi oshkor bo‘lmaydi (CLI-405/P11: 404, 403 emas).
    expect([403, 404]).toContain(res.status);
    expect(res.status).not.toBe(200);
  });

  test('patientB sanity: boshqa tenant bemori buyurtmasi A orqali yaratilmaydi (ownership)', async () => {
    const res = await json(
      await asDoctor(),
      'POST',
      '/api/lab-orders',
      validBody({ patientId: patientB }),
    );
    expect(res.status).toBe(400);
  });
});
