/**
 * FT-06.3 — kassa rasmi HTTP (REAL DB + REAL createApp + real fayl-tizimi + real cheklangan rollar).
 *
 * Rollar `ROLE_TEMPLATES` permset'lari bilan haqiqiy `roles`/`role_permissions`/`user_assignments`
 * qatorlari sifatida (filial doirasi ham real). `@owner` ishlatilmaydi.
 *  - sozlama o'chiq (standart) → POST 409 disabled;
 *  - Receptionist (cashier.create_transaction bor) rasm/skippedReason yozadi; Doctor (yo'q) → 403;
 *  - rasmni FAQAT Tenant Admin ko'radi (GET /transactions/{id}/photo va /uploads/…); Receptionist/Accountant → 403;
 *  - boshqa tenant: 404 (tx ko'rinmaydi, /uploads 404); boshqa filial doirasi → 403;
 *  - dublikat → 409; refund qatoriga → 409; noto'g'ri tur 415; noto'g'ri skippedReason 400;
 *  - PATCH /tenant-settings `cashierPhotoEnabled` Tenant Admin'da ishlaydi, Receptionist 403.
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env --timeout 30000 tests/integration/ft-06-cashier-photos-http.test.ts`
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const uploadsDir = await mkdtemp(join(tmpdir(), 'ft063-uploads-'));
process.env.UPLOADS_DIR = uploadsDir;

const { PERMISSIONS, ROLE_TEMPLATES } = await import('@dental/core');
const {
  auditLog,
  branches,
  cashierTransactionPhotos,
  cashierTransactions,
  patients,
  permissions,
  rolePermissions,
  roles,
  tenants,
  userAssignments,
  users,
} = await import('@dental/db-schema');
const { and, eq, inArray, sql } = await import('drizzle-orm');
const { createApp } = await import('../../src/app.ts');
const { db } = await import('../../src/db/client.ts');
const { signAccess } = await import('../../src/lib/jwt.ts');

const app = createApp();
let n = 0;
const nextIp = () => `10.63.${Math.floor(n / 250) % 250}.${(n++ % 250) + 1}`;

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const withTenant = <T>(tid: string, fn: (tx: DbTx) => Promise<T>): Promise<T> =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tid}'`));
    return fn(tx);
  });

let tA: string;
let tB: string;
let brA: string;
let brB: string;
let txPay: string; // tenant A, branch A, payment
let txRefund: string;
let txOtherBranch: string; // tenant A, branch B
let txForeign: string; // tenant B
const tok: Record<string, string> = {};
const uid: Record<string, string> = {};

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

const post = (who: string, txId: string, form: FormData) =>
  app.request(`/api/cashier/transactions/${txId}/photo`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tok[who]}`, 'x-real-ip': nextIp() },
    body: form,
  });
const get = (who: string, path: string) =>
  app.request(path, { headers: { Authorization: `Bearer ${tok[who]}`, 'x-real-ip': nextIp() } });
// Bun multipart parser fayl turini FAYL NOMI kengaytmasidan aniqlaydi — nom turga mos beriladi.
const fileForm = (type = 'image/png', name = 'shot.png') => {
  const f = new FormData();
  f.set('file', new File([PNG], name, { type }));
  return f;
};
const reasonForm = (reason: string) => {
  const f = new FormData();
  f.set('skippedReason', reason);
  return f;
};

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const mk = async (phone: string, name: string) => {
    const [u] = await db
      .insert(users)
      .values({ phone, passwordHash: 'x', fullName: name })
      .returning({ id: users.id });
    uid[name] = u?.id ?? '';
    return u?.id ?? '';
  };
  const owner = await mk('+998900006301', 'owner');
  for (const [i, name] of [
    'admin',
    'reception',
    'accountant',
    'doctor',
    'recB',
    'foreignAdmin',
  ].entries()) {
    await mk(`+99890000631${i}`, name);
  }
  const ts = await db
    .insert(tenants)
    .values([
      { name: 'A', slug: 'ft063-a', ownerUserId: owner },
      { name: 'B', slug: 'ft063-b', ownerUserId: owner },
    ])
    .returning({ id: tenants.id });
  tA = ts[0]?.id ?? '';
  tB = ts[1]?.id ?? '';

  await db
    .insert(permissions)
    .values(
      PERMISSIONS.map((p) => ({
        code: p.code,
        category: p.category,
        descriptionUz: p.descriptionUz,
        descriptionRu: p.descriptionRu,
      })),
    )
    .onConflictDoNothing();
  const permRows = await db
    .select({ id: permissions.id, code: permissions.code })
    .from(permissions);
  const permId = (code: string) => permRows.find((p) => p.code === code)?.id ?? '';

  const roleOf = async (tid: string, tplName: string) => {
    const tpl = ROLE_TEMPLATES.find((r) => r.name === tplName);
    if (!tpl) throw new Error(`template yo'q: ${tplName}`);
    const [r] = await withTenant(tid, (tx) =>
      tx
        .insert(roles)
        .values({ tenantId: tid, name: tpl.name, templateKey: tpl.templateKey, isSystem: true })
        .returning({ id: roles.id }),
    );
    await withTenant(tid, (tx) =>
      tx
        .insert(rolePermissions)
        .values(tpl.permissions.map((p) => ({ roleId: r?.id ?? '', permissionId: permId(p) }))),
    );
    return r?.id ?? '';
  };

  const [a, b] = await withTenant(tA, (tx) =>
    tx
      .insert(branches)
      .values([
        { tenantId: tA, name: 'A' },
        { tenantId: tA, name: 'B' },
      ])
      .returning({ id: branches.id }),
  );
  brA = a?.id ?? '';
  brB = b?.id ?? '';
  const [fb] = await withTenant(tB, (tx) =>
    tx.insert(branches).values({ tenantId: tB, name: 'FB' }).returning({ id: branches.id }),
  );

  const rAdmin = await roleOf(tA, 'Tenant Admin');
  const rRec = await roleOf(tA, 'Receptionist');
  const rAcc = await roleOf(tA, 'Accountant');
  const rDoc = await roleOf(tA, 'Doctor');
  const rForeign = await roleOf(tB, 'Tenant Admin');
  const asg = (tid: string, user: string, branchId: string | null, roleId: string) => ({
    tenantId: tid,
    userId: uid[user] ?? '',
    branchId,
    roleId,
  });
  await withTenant(tA, (tx) =>
    tx
      .insert(userAssignments)
      .values([
        asg(tA, 'admin', null, rAdmin),
        asg(tA, 'reception', brA, rRec),
        asg(tA, 'recB', brB, rRec),
        asg(tA, 'accountant', null, rAcc),
        asg(tA, 'doctor', null, rDoc),
      ]),
  );
  await withTenant(tB, (tx) =>
    tx.insert(userAssignments).values(asg(tB, 'foreignAdmin', null, rForeign)),
  );

  const txVals = (tid: string, branchId: string) => ({
    tenantId: tid,
    branchId,
    totalAmount: '100000',
    paidAmount: '100000',
    paymentMethod: 'cash' as const,
  });
  const [p1, p2] = await withTenant(tA, (tx) =>
    tx
      .insert(cashierTransactions)
      .values([txVals(tA, brA), txVals(tA, brB)])
      .returning({ id: cashierTransactions.id }),
  );
  txPay = p1?.id ?? '';
  txOtherBranch = p2?.id ?? '';
  const [r1] = await withTenant(tA, (tx) =>
    tx
      .insert(cashierTransactions)
      .values({ ...txVals(tA, brA), type: 'refund', parentTransactionId: txPay })
      .returning({ id: cashierTransactions.id }),
  );
  txRefund = r1?.id ?? '';
  const [f1] = await withTenant(tB, (tx) =>
    tx
      .insert(cashierTransactions)
      .values(txVals(tB, fb?.id ?? ''))
      .returning({ id: cashierTransactions.id }),
  );
  txForeign = f1?.id ?? '';

  const claims = (user: string, tid: string, perms: string[]) =>
    signAccess({ sub: uid[user] ?? '', atid: tid, abid: null, perms, roleKey: null, lang: 'uz' });
  const permsOf = (name: string) => [
    ...(ROLE_TEMPLATES.find((r) => r.name === name)?.permissions ?? []),
  ];
  tok.admin = (await claims('admin', tA, permsOf('Tenant Admin'))).token;
  tok.reception = (await claims('reception', tA, permsOf('Receptionist'))).token;
  tok.recB = (await claims('recB', tA, permsOf('Receptionist'))).token;
  tok.accountant = (await claims('accountant', tA, permsOf('Accountant'))).token;
  tok.doctor = (await claims('doctor', tA, permsOf('Doctor'))).token;
  tok.foreignAdmin = (await claims('foreignAdmin', tB, permsOf('Tenant Admin'))).token;
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  await rm(uploadsDir, { recursive: true, force: true });
});

describe('FT-06.3 kassa rasmi', () => {
  test('sozlama standart o‘chiq: GET photo-settings false, POST → 409 disabled, hech narsa yozilmaydi', async () => {
    const s = await get('reception', '/api/cashier/photo-settings');
    expect(s.status).toBe(200);
    expect(((await s.json()) as { data: { enabled: boolean } }).data.enabled).toBe(false);

    const res = await post('reception', txPay, fileForm());
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
      'cashier_photo.disabled',
    );
    const rows = await withTenant(tA, (tx) => tx.select().from(cashierTransactionPhotos));
    expect(rows).toHaveLength(0);
  });

  test('PATCH /tenant-settings cashierPhotoEnabled: Receptionist 403, Tenant Admin 200', async () => {
    const patch = (who: string) =>
      app.request('/api/tenant-settings', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${tok[who]}`,
          'Content-Type': 'application/json',
          'x-real-ip': nextIp(),
        },
        body: JSON.stringify({ cashierPhotoEnabled: true }),
      });
    expect((await patch('reception')).status).toBe(403);
    const ok = await patch('admin');
    expect(ok.status).toBe(200);
    expect(
      ((await ok.json()) as { data: { cashierPhotoEnabled: boolean } }).data.cashierPhotoEnabled,
    ).toBe(true);
    const s = await get('reception', '/api/cashier/photo-settings');
    expect(((await s.json()) as { data: { enabled: boolean } }).data.enabled).toBe(true);
  });

  test('Doctor (cashier.create_transaction yo‘q) → 403', async () => {
    expect((await post('doctor', txPay, fileForm())).status).toBe(403);
  });

  test('noto‘g‘ri kirishlar: tur 415, skippedReason 400, bo‘sh 400, UUID emas 400', async () => {
    expect((await post('reception', txPay, fileForm('application/pdf', 'doc.pdf'))).status).toBe(
      415,
    );
    expect((await post('reception', txPay, reasonForm('boom'))).status).toBe(400);
    expect((await post('reception', txPay, new FormData())).status).toBe(400);
    expect((await post('reception', 'abc', fileForm())).status).toBe(400);
  });

  test('refund qatoriga → 409 not_payment; mavjud emas → 404; boshqa tenant tx → 404', async () => {
    expect((await post('reception', txRefund, fileForm())).status).toBe(409);
    expect((await post('reception', crypto.randomUUID(), fileForm())).status).toBe(404);
    expect((await post('reception', txForeign, fileForm())).status).toBe(404);
  });

  test('boshqa filial doirasi (recB faqat B) → 403, hech narsa yozilmaydi', async () => {
    expect((await post('recB', txPay, fileForm())).status).toBe(403);
    const rows = await withTenant(tA, (tx) => tx.select().from(cashierTransactionPhotos));
    expect(rows).toHaveLength(0);
  });

  let photoUrl: string;
  test('Receptionist rasm yozadi → 201, fayl diskda, qator + audit', async () => {
    const res = await post('reception', txPay, fileForm());
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      data: { id: string; url: string | null; skippedReason: string | null; capturedBy: string };
    };
    expect(body.data.url).toStartWith('/uploads/');
    expect(body.data.skippedReason).toBeNull();
    expect(body.data.capturedBy).toBe(uid.reception ?? '');
    photoUrl = body.data.url ?? '';
    const [row] = await withTenant(tA, (tx) => tx.select().from(cashierTransactionPhotos));
    expect(row?.objectKey).toStartWith(`tenants/${tA}/cashier-photos/${txPay}/`);
    expect(await Bun.file(join(uploadsDir, row?.objectKey ?? '')).exists()).toBe(true);
    const audits = await withTenant(tA, (tx) =>
      tx
        .select()
        .from(auditLog)
        .where(
          and(
            eq(auditLog.resourceType, 'cashier_transaction_photo'),
            eq(auditLog.action, 'created'),
          ),
        ),
    );
    expect(audits).toHaveLength(1);
  });

  test('dublikat → 409 exists (ikkinchi fayl diskda qolmaydi)', async () => {
    const res = await post('reception', txPay, fileForm());
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
      'cashier_photo.exists',
    );
  });

  test('skippedReason bilan (rasmsiz) yoziladi', async () => {
    // Boshqa to'lov kerak — txOtherBranch (B filial) uchun recB.
    const res = await post('recB', txOtherBranch, reasonForm('permission_denied'));
    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { url: string | null; skippedReason: string } };
    expect(body.data.url).toBeNull();
    expect(body.data.skippedReason).toBe('permission_denied');
  });

  test('ko‘rish: Receptionist/Accountant/Doctor 403; Tenant Admin 200 + url', async () => {
    for (const who of ['reception', 'accountant', 'doctor']) {
      expect((await get(who, `/api/cashier/transactions/${txPay}/photo`)).status).toBe(403);
    }
    const res = await get('admin', `/api/cashier/transactions/${txPay}/photo`);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { data: { url: string } }).data.url).toBe(photoUrl);
    const viewed = await withTenant(tA, (tx) =>
      tx
        .select()
        .from(auditLog)
        .where(
          and(
            eq(auditLog.resourceType, 'cashier_transaction_photo'),
            eq(auditLog.action, 'viewed'),
          ),
        ),
    );
    expect(viewed).toHaveLength(1);
  });

  test('GET /cashier/transactions: photoStatus faqat cashier.photo.view egasiga; patientName qo‘shiladi', async () => {
    const [pt] = await withTenant(tA, (tx) =>
      tx.insert(patients).values({ tenantId: tA, fullName: 'Ali Valiyev' }).returning({
        id: patients.id,
      }),
    );
    await withTenant(tA, (tx) =>
      tx
        .update(cashierTransactions)
        .set({ patientId: pt?.id ?? null })
        .where(eq(cashierTransactions.id, txPay)),
    );
    type Row = { id: string; photoStatus: string | null; patientName: string | null };
    const list = async (who: string) => {
      const res = await get(who, '/api/cashier/transactions?pageSize=50');
      expect(res.status).toBe(200);
      const rows = ((await res.json()) as { data: { data: Row[] } }).data.data;
      return new Map(rows.map((r) => [r.id, r]));
    };
    const adminRows = await list('admin');
    expect(adminRows.get(txPay)?.photoStatus).toBe('photo');
    expect(adminRows.get(txOtherBranch)?.photoStatus).toBe('skipped');
    expect(adminRows.get(txRefund)?.photoStatus).toBeNull();
    expect(adminRows.get(txPay)?.patientName).toBe('Ali Valiyev');
    expect(adminRows.get(txOtherBranch)?.patientName).toBeNull();
    // Receptionist (cashier.view bor, cashier.photo.view yo'q) — maydon null.
    const recRows = await list('reception');
    expect(recRows.get(txPay)?.photoStatus).toBeNull();
    expect(recRows.get(txPay)?.patientName).toBe('Ali Valiyev');
  });

  test('rasmsiz tranzaksiya → 404', async () => {
    expect((await get('admin', `/api/cashier/transactions/${txRefund}/photo`)).status).toBe(404);
  });

  test('/uploads/…: Receptionist/Accountant 403, Tenant Admin 200 (bayt), boshqa tenant admin 404', async () => {
    expect((await get('reception', photoUrl)).status).toBe(403);
    expect((await get('accountant', photoUrl)).status).toBe(403);
    expect((await get('doctor', photoUrl)).status).toBe(403);
    const ok = await get('admin', photoUrl);
    expect(ok.status).toBe(200);
    expect(new Uint8Array(await ok.arrayBuffer())).toEqual(PNG);
    expect((await get('foreignAdmin', photoUrl)).status).toBe(404);
    expect((await get('foreignAdmin', `/api/cashier/transactions/${txPay}/photo`)).status).toBe(
      404,
    );
  });

  test('RLS: boshqa tenant konteksti qatorlarni ko‘rmaydi', async () => {
    const rows = await withTenant(tB, (tx) =>
      tx
        .select({ id: cashierTransactionPhotos.id })
        .from(cashierTransactionPhotos)
        .where(inArray(cashierTransactionPhotos.tenantId, [tA, tB])),
    );
    expect(rows).toHaveLength(0);
  });
});
