/**
 * FT-06 seam — `/uploads` ruxsat kesishmalari (REAL DB + REAL createApp + real fayl-tizimi).
 *
 * Rollar haqiqiy `roles`/`role_permissions`/`user_assignments` qatorlari; `@owner` ishlatilmaydi.
 *  1. Receptionist (`patient.view` bor, `patient_image.view` YO'Q) bemor avatarini ko'radi —
 *     faqat key biror bemorning joriy `photo_url`iga teng bo'lsa (RLS ostida qidiriladi);
 *     shu bemorning klinik rasmi (rentgen) → 403. Audit yoziladi.
 *  2. `cashier-photos/` filial doirasi: `cashier.photo.view` faqat A filialida bo'lgan rol →
 *     A filial tranzaksiyasi rasmi 200, B filial rasmi 403.
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env --timeout 30000 tests/integration/ft-06-uploads-scope.test.ts`
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const uploadsDir = await mkdtemp(join(tmpdir(), 'ft06-uploads-scope-'));
process.env.UPLOADS_DIR = uploadsDir;

const { PERMISSIONS, ROLE_TEMPLATES } = await import('@dental/core');
const {
  auditLog,
  branches,
  cashierTransactionPhotos,
  cashierTransactions,
  patientImages,
  patients,
  permissions,
  rolePermissions,
  roles,
  tenants,
  userAssignments,
  users,
} = await import('@dental/db-schema');
const { and, eq, sql } = await import('drizzle-orm');
const { createApp } = await import('../../src/app.ts');
const { db } = await import('../../src/db/client.ts');
const { signAccess } = await import('../../src/lib/jwt.ts');
const { createLocalStorageAdapter } = await import('../../src/lib/storage.ts');

const app = createApp();
const storage = createLocalStorageAdapter(uploadsDir);
let n = 0;
const nextIp = () => `10.64.${Math.floor(n / 250) % 250}.${(n++ % 250) + 1}`;

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const withTenant = <T>(tid: string, fn: (tx: DbTx) => Promise<T>): Promise<T> =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tid}'`));
    return fn(tx);
  });

let tA: string;
let faceKey: string;
let xrayKey: string;
let photoKeyA: string;
let photoKeyB: string;
const tok: Record<string, string> = {};
const uid: Record<string, string> = {};

const get = (who: string, key: string) =>
  app.request(`/uploads/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${tok[who]}`, 'x-real-ip': nextIp() },
  });

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
  const owner = await mk('+998900006401', 'owner');
  await mk('+998900006402', 'reception');
  await mk('+998900006403', 'photoA');
  const [t] = await db
    .insert(tenants)
    .values({ name: 'A', slug: 'ft06-scope-a', ownerUserId: owner })
    .returning({ id: tenants.id });
  tA = t?.id ?? '';

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

  const makeRole = async (name: string, perms: readonly string[], templateKey?: string) => {
    const [r] = await withTenant(tA, (tx) =>
      tx
        .insert(roles)
        .values({ tenantId: tA, name, templateKey: templateKey ?? null, isSystem: !!templateKey })
        .returning({ id: roles.id }),
    );
    await withTenant(tA, (tx) =>
      tx
        .insert(rolePermissions)
        .values(perms.map((p) => ({ roleId: r?.id ?? '', permissionId: permId(p) }))),
    );
    return r?.id ?? '';
  };
  const recTpl = ROLE_TEMPLATES.find((r) => r.name === 'Receptionist');
  if (!recTpl) throw new Error('Receptionist template yo‘q');
  expect(recTpl.permissions).toContain('patient.view');
  expect(recTpl.permissions).not.toContain('patient_image.view');
  const rRec = await makeRole(recTpl.name, recTpl.permissions, recTpl.templateKey);
  const photoPerms = ['cashier.photo.view'];
  const rPhoto = await makeRole('Kassa rasmi kuzatuvchi', photoPerms);

  const [a, b] = await withTenant(tA, (tx) =>
    tx
      .insert(branches)
      .values([
        { tenantId: tA, name: 'A' },
        { tenantId: tA, name: 'B' },
      ])
      .returning({ id: branches.id }),
  );
  const brA = a?.id ?? '';
  const brB = b?.id ?? '';
  await withTenant(tA, (tx) =>
    tx.insert(userAssignments).values([
      { tenantId: tA, userId: uid.reception ?? '', branchId: brA, roleId: rRec },
      { tenantId: tA, userId: uid.photoA ?? '', branchId: brA, roleId: rPhoto },
    ]),
  );

  // 1) bemor: avatar (face_photo, photo_url ga teng) + rentgen (klinik).
  await withTenant(tA, async (tx) => {
    const [p] = await tx
      .insert(patients)
      .values({ tenantId: tA, fullName: 'Bemor' })
      .returning({ id: patients.id });
    const pid = p?.id ?? '';
    faceKey = `tenants/${tA}/patients/${pid}/${crypto.randomUUID()}.jpg`;
    xrayKey = `tenants/${tA}/patients/${pid}/${crypto.randomUUID()}.jpg`;
    const base = { tenantId: tA, patientId: pid, contentType: 'image/jpeg', sizeBytes: 3 };
    await tx.insert(patientImages).values([
      { ...base, type: 'face_photo', objectKey: faceKey, originalFilename: 'face.jpg' },
      { ...base, type: 'xray_panoramic', objectKey: xrayKey, originalFilename: 'xray.jpg' },
    ]);
    await tx
      .update(patients)
      .set({ photoUrl: storage.serveUrl(faceKey) })
      .where(eq(patients.id, pid));
  });
  await storage.save(faceKey, Buffer.from('face'));
  await storage.save(xrayKey, Buffer.from('xray'));

  // 2) kassa: A va B filial tranzaksiyalari + rasm qatorlari.
  const txVals = (branchId: string) => ({
    tenantId: tA,
    branchId,
    totalAmount: '100000',
    paidAmount: '100000',
    paymentMethod: 'cash' as const,
  });
  const [txA, txB] = await withTenant(tA, (tx) =>
    tx
      .insert(cashierTransactions)
      .values([txVals(brA), txVals(brB)])
      .returning({ id: cashierTransactions.id }),
  );
  photoKeyA = `tenants/${tA}/cashier-photos/${txA?.id}/${crypto.randomUUID()}.png`;
  photoKeyB = `tenants/${tA}/cashier-photos/${txB?.id}/${crypto.randomUUID()}.png`;
  await withTenant(tA, (tx) =>
    tx.insert(cashierTransactionPhotos).values([
      { tenantId: tA, transactionId: txA?.id ?? '', objectKey: photoKeyA },
      { tenantId: tA, transactionId: txB?.id ?? '', objectKey: photoKeyB },
    ]),
  );
  await storage.save(photoKeyA, Buffer.from('pa'));
  await storage.save(photoKeyB, Buffer.from('pb'));

  const sign = async (user: string, perms: readonly string[]) =>
    (
      await signAccess({
        sub: uid[user] ?? '',
        atid: tA,
        abid: brA,
        perms: [...perms],
        roleKey: null,
        lang: 'uz',
      })
    ).token;
  tok.reception = await sign('reception', recTpl.permissions);
  tok.photoA = await sign('photoA', photoPerms);
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  await rm(uploadsDir, { recursive: true, force: true });
});

describe('FT-06 seam: /uploads bemor avatari (Receptionist)', () => {
  test('avatar key (photo_url) → 200, baytlar mos, audit yoziladi', async () => {
    const res = await get('reception', faceKey);
    expect(res.status).toBe(200);
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe('face');
    const audits = await withTenant(tA, (tx) =>
      tx
        .select()
        .from(auditLog)
        .where(and(eq(auditLog.action, 'viewed'), eq(auditLog.userId, uid.reception ?? ''))),
    );
    expect(audits).toHaveLength(1);
  });

  test('shu bemorning klinik rasmi (photo_url emas) → 403', async () => {
    expect((await get('reception', xrayKey)).status).toBe(403);
  });
});
