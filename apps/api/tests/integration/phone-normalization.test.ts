/**
 * Task 9 — Telefon raqami barcha kirish nuqtalarida kanonik shaklga keltiriladi.
 *
 * REGRESSIYA (reliz gate): Task 7 `provisionTenantInTx`ga `normalizePhone` qo'shdi
 * (`users.phone` bazaga `+998...` bo'lib yoziladi), lekin `login()` va
 * `users.service.invite()` hali RAW `eq(users.phone, input.phone)` ishlatardi.
 * Natija: `register-tenant` (ownerPhone='998901239999') → 201, keyin
 * `login` (phone='998901239999') → 401. HEAD~1 da 200 edi.
 *
 * Bu fayl shu probe'ni test sifatida qotiradi + xodim taklifidagi bir xil sinf
 * xatosini (bir odam ikki formatda ikki hisob) yopadi.
 *
 * Talab: Postgres + Redis ishlab turishi, migratsiyalar qo'llangan.
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env phone-normalization`
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { branches, roles, tenants, users } from '@dental/db-schema';
import { OpenAPIHono } from '@hono/zod-openapi';
import { sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import type { AuditLogger } from '../../src/lib/audit-logger.ts';
import { env } from '../../src/lib/env.ts';
import { closeRateLimitRedis } from '../../src/lib/rate-limit.ts';
import { authRoutes } from '../../src/modules/auth/auth.routes.ts';
import { createUsersService } from '../../src/modules/users/users.service.ts';

const app = new OpenAPIHono();
app.route('/api/auth', authRoutes({ db }));

const noopAudit = { record: async () => {} } as unknown as AuditLogger;
const usersService = createUsersService({ db, audit: noopAudit });

/** Har so'rov uchun boshqa IP — rate-limit (login/register) testni buzmasin. */
const freshIp = () =>
  `10.9.${Math.floor(Math.random() * 250 + 1)}.${Math.floor(Math.random() * 250 + 1)}`;

const registerTenant = (ownerPhone: string, tenantName: string) =>
  app.request('/api/auth/register-tenant', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': freshIp() },
    body: JSON.stringify({
      tenantName,
      ownerPhone,
      ownerFullName: 'Telefon Normalizatsiya',
      ownerPassword: 'CorrectHorseBattery1',
      defaultLanguage: 'uz',
    }),
  });

const login = (phone: string) =>
  app.request('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': freshIp() },
    body: JSON.stringify({ phone, password: 'CorrectHorseBattery1' }),
  });

let tenantId: string;
let ownerId: string;
let roleId: string;
let branchId: string;

const ctx = (tx: DbOrTx): Context =>
  ({
    get: (k: string) =>
      k === 'db'
        ? tx
        : k === 'accessClaims'
          ? { perms: ['@owner'] }
          : k === 'activeTenantId'
            ? tenantId
            : k === 'user'
              ? { id: ownerId }
              : undefined,
    req: { header: () => undefined },
  }) as unknown as Context;

const withTx = <T>(fn: (tx: DbOrTx) => Promise<T>): Promise<T> =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    return fn(tx);
  });

const truncate = () => db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);

beforeAll(async () => {
  await truncate();

  // Xodim-taklif testi uchun alohida tenant (auth oqimidan mustaqil).
  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900009000', passwordHash: 'x', fullName: 'Owner Task9' })
    .returning({ id: users.id });
  if (!owner) throw new Error('owner insert failed');
  ownerId = owner.id;

  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'Task9 Clinic', slug: 'task9-clinic', ownerUserId: ownerId })
    .returning({ id: tenants.id });
  if (!tenant) throw new Error('tenant insert failed');
  tenantId = tenant.id;

  await withTx(async (tx) => {
    const [branch] = await tx
      .insert(branches)
      .values({ tenantId, name: 'Bosh filial' })
      .returning({ id: branches.id });
    const [role] = await tx
      .insert(roles)
      .values({ tenantId, name: 'Doctor' })
      .returning({ id: roles.id });
    if (!branch || !role) throw new Error('branch/role insert failed');
    branchId = branch.id;
    roleId = role.id;
  });
});

afterAll(async () => {
  await truncate();
  await closeRateLimitRedis();
});

describe('Task 9 — telefon normalizatsiyasi', () => {
  test('register-tenant `+`siz raqam bilan → o‘sha raqam bilan login 200 (regressiya probe)', async () => {
    const raw = '998901239999';

    const registered = await registerTenant(raw, 'Probe Clinic');
    expect(registered.status).toBe(201);

    // Bazada kanonik shakl saqlanadi.
    const stored = await db.query.users.findFirst({
      where: (u, { eq }) => eq(u.phone, '+998901239999'),
    });
    expect(stored).toBeDefined();

    const res = await login(raw);
    expect(res.status).toBe(200);
  });

  test('9 xonali mahalliy format bilan login ham o‘sha hisobga tushadi', async () => {
    const registered = await registerTenant('+998901238888', 'Local Format Clinic');
    expect(registered.status).toBe(201);

    const res = await login('901238888');
    expect(res.status).toBe(200);

    const body = (await res.json()) as { data?: { user?: { phone?: string } } };
    expect(body.data?.user?.phone).toBe('+998901238888');
  });

  test('xodim taklifi mavjud foydalanuvchini boshqa formatda ham topadi (dublikat yo‘q)', async () => {
    const [existing] = await db
      .insert(users)
      .values({ phone: '+998901237777', passwordHash: 'x', fullName: 'Mavjud Xodim' })
      .returning({ id: users.id });
    if (!existing) throw new Error('existing user insert failed');

    const before = (await db.select().from(users)).length;

    const result = await withTx((tx) =>
      usersService.invite(ctx(tx), {
        phone: '901237777',
        fullName: 'Mavjud Xodim',
        roleId,
        branchId,
      }),
    );

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.userId).toBe(existing.id);

    const after = (await db.select().from(users)).length;
    expect(after).toBe(before);
  });

  test('login rate-limit bucket telefon FORMATIGA emas, HISOBGA bog‘lanadi', async () => {
    // Login endi barcha yozilishlarni bitta hisobga olib boradi. Agar rate-limit
    // kaliti XOM telefonni ishlatsa, brute-force qiluvchi shu bitta hisob uchun
    // kvotani formatni almashtirib (`+998…`, `998…`, `901…`) ko'paytira olardi.
    const ip = freshIp();
    const attempt = (phone: string) =>
      app.request('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
        body: JSON.stringify({ phone, password: 'WrongPasswordHere1' }),
      });

    // Kvotani BITTA yozilish bilan tugatamiz (noto'g'ri parol → 401, lekin
    // hisoblagich baribir sanaydi).
    for (let i = 0; i < env.AUTH_LOGIN_RATE_LIMIT; i++) {
      await attempt('+998901235555');
    }

    // Boshqa yozilish — AYNI hisob → o'sha bucket → 429 (yangi kvota emas).
    const other = await attempt('901235555');
    expect(other.status).toBe(429);
  });

  test('boshqa formatda qayta ro‘yxatdan o‘tish → phone_taken (ikkinchi hisob YARATILMAYDI)', async () => {
    // `register-tenant` dublikatni `users_phone_unique` buzilishini ushlab
    // aniqlaydi (auth.routes.ts). Normalizatsiyasiz `+998…` va `901…` ikki
    // ALOHIDA qator bo'lib sig'ardi — indeks buzilmasdi, xato ham qaytmasdi va
    // bitta odam ikki platform hisobiga ega bo'lib qolardi (CLAUDE.md §3.1).
    const first = await registerTenant('+998901237171', 'Dublikat Klinika');
    expect(first.status).toBe(201);

    const second = await registerTenant('901237171', 'Dublikat Klinika 2');
    expect(second.status).toBe(409);
    const body = (await second.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe('auth.phone_taken');

    const rows = await db.select().from(users);
    expect(rows.filter((u) => u.phone === '+998901237171').length).toBe(1);
  });

  test('yangi xodim taklifi kanonik shaklda saqlanadi', async () => {
    await withTx((tx) =>
      usersService.invite(ctx(tx), {
        phone: '901236666',
        fullName: 'Yangi Xodim',
        roleId,
        branchId,
      }),
    );

    const created = await db.query.users.findFirst({
      where: (u, { eq }) => eq(u.phone, '+998901236666'),
    });
    expect(created).toBeDefined();
  });
});
