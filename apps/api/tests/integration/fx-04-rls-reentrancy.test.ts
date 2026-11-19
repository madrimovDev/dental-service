/**
 * FX-04 (LA-05) — rlsMiddleware qayta kirish guard'i.
 * Bare `/api`ga mount qilingan modullarning `app.use('*', rlsMiddleware)` i
 * `/api/*` ga oqadi: bitta so'rov 2–4 ta ichma-ich tranzaksiyani alohida pool
 * ulanishlarida ochardi. Invariant: bitta so'rov = bitta tenant tx.
 * REAL DB, real createApp(), CHEKLANGAN rol (@owner EMAS).
 *
 *   cd apps/api && bun test --env-file=../../.env --timeout 30000 tests/integration/fx-04-rls-reentrancy.test.ts
 */
import { afterAll, beforeAll, describe, expect, spyOn, test } from 'bun:test';
import {
  patients,
  roles,
  tenants,
  treatmentPlans,
  userAssignments,
  users,
} from '@dental/db-schema';
import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { createApp } from '../../src/app.ts';
import { db } from '../../src/db/client.ts';
import { getDb, withTenant } from '../../src/db/scoped.ts';
import { signAccess } from '../../src/lib/jwt.ts';
import { rlsMiddleware } from '../../src/middleware/rls.ts';

let tA: string;
let tB: string;
let staffA: string;
let patientA: string;
let patientB: string;
let planA: string;
let planB: string;
let token: string;

const get = (path: string) =>
  createApp().request(path, { headers: { authorization: `Bearer ${token}` } });

/**
 * So'rov davomida bir vaqtda ochiq `db.transaction` larning MAKSIMAL soni
 * (ichma-ich = alohida pool ulanishi). Ketma-ket, yopilgan tx (masalan, 30 s
 * keshli obuna o'qishi — `lib/subscription.ts`) bu invariantni buzmaydi.
 */
const countTx = async (fn: () => Promise<Response>) => {
  const original = db.transaction.bind(db);
  let open = 0;
  let maxOpen = 0;
  const spy = spyOn(db, 'transaction').mockImplementation(((
    ...args: Parameters<typeof original>
  ) => {
    open++;
    maxOpen = Math.max(maxOpen, open);
    return original(...args).finally(() => {
      open--;
    });
  }) as typeof db.transaction);
  try {
    const res = await fn();
    return { res, txCount: maxOpen };
  } finally {
    spy.mockRestore();
  }
};

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const mk = async (phone: string, name: string) => {
    const [u] = await db
      .insert(users)
      .values({ phone, passwordHash: 'x', fullName: name })
      .returning({ id: users.id });
    return u!.id;
  };
  const ownerA = await mk('+998900004001', 'Owner A');
  const ownerB = await mk('+998900004002', 'Owner B');
  staffA = await mk('+998900004003', 'Doctor A');

  const mkTenant = async (slug: string, owner: string) => {
    const [t] = await db
      .insert(tenants)
      .values({ name: slug, slug, ownerUserId: owner })
      .returning({ id: tenants.id });
    return t!.id;
  };
  tA = await mkTenant('fx04-a', ownerA);
  tB = await mkTenant('fx04-b', ownerB);

  await withTenant(tA, async (tx) => {
    const [role] = await tx
      .insert(roles)
      .values({ tenantId: tA, name: 'Clinical', isSystem: false })
      .returning({ id: roles.id });
    await tx
      .insert(userAssignments)
      .values({ userId: staffA, tenantId: tA, roleId: role!.id, isActive: true });
    const [p] = await tx
      .insert(patients)
      .values({ tenantId: tA, fullName: 'A bemor', phone: '+998901140001' })
      .returning({ id: patients.id });
    patientA = p!.id;
    const [plan] = await tx
      .insert(treatmentPlans)
      .values({ tenantId: tA, patientId: patientA, doctorId: staffA, title: 'A plan' })
      .returning({ id: treatmentPlans.id });
    planA = plan!.id;
  });
  await withTenant(tB, async (tx) => {
    const [p] = await tx
      .insert(patients)
      .values({ tenantId: tB, fullName: 'B bemor', phone: '+998901140002' })
      .returning({ id: patients.id });
    patientB = p!.id;
    const [plan] = await tx
      .insert(treatmentPlans)
      .values({ tenantId: tB, patientId: patientB, doctorId: ownerB, title: 'B plan' })
      .returning({ id: treatmentPlans.id });
    planB = plan!.id;
  });

  ({ token } = await signAccess({
    sub: staffA,
    atid: tA,
    abid: null,
    perms: ['medical_record.view', 'patient_image.view', 'patient.view'],
    roleKey: null,
    lang: 'uz',
  }));
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('FX-04 — bitta so‘rov = bitta tenant tranzaksiya', () => {
  test('GET /api/treatment-plans → bir vaqtda 1 ta tx, faqat A rejalari', async () => {
    const { res, txCount } = await countTx(() => get('/api/treatment-plans'));
    expect(res.status).toBe(200);
    expect(txCount).toBe(1);
    const body = (await res.json()) as { data: { data: { id: string }[] } };
    const ids = body.data.data.map((p) => p.id);
    expect(ids).toContain(planA);
    expect(ids).not.toContain(planB);
  });

  test('GET /api/patients/:id/images → bir vaqtda 1 ta tx', async () => {
    const { res, txCount } = await countTx(() => get(`/api/patients/${patientA}/images`));
    expect(res.status).toBe(200);
    expect(txCount).toBe(1);
  });

  test('GET /api/patients/<B bemor>/images → RLS izolyatsiyasi saqlanadi (B rasmlari chiqmaydi)', async () => {
    const { res, txCount } = await countTx(() => get(`/api/patients/${patientB}/images`));
    expect(txCount).toBe(1);
    if (res.status === 200) {
      const body = (await res.json()) as { data: unknown[] };
      expect(body.data).toEqual([]);
    } else {
      expect(res.status).toBe(404);
    }
  });
});

describe('FX-04 — guard semantikasi (izolyatsiyalangan Hono)', () => {
  const build = (innerTenant: () => string) => {
    const app = new Hono();
    app.use('*', async (c, next) => {
      c.set('activeTenantId', tA);
      await next();
    });
    app.use('*', rlsMiddleware(db));
    app.use('*', async (c, next) => {
      // Ichki modul auth'i qayta ishlaydi — tenant odatda bir xil.
      c.set('activeTenantId', innerTenant());
      await next();
    });
    app.use('*', rlsMiddleware(db));
    app.get('/x', async (c) => {
      const [row] = (await getDb(c).execute(
        sql`SELECT current_setting('app.current_tenant_id', true) AS t`,
      )) as unknown as { t: string }[];
      return c.json({ t: row!.t });
    });
    app.onError((_err, c) => c.json({ error: 'boom' }, 500));
    return app;
  };

  test('bir xil tenant: ichki rls tx ochmaydi, tashqi tx tenant konteksti ishlaydi', async () => {
    const { res, txCount } = await countTx(() => build(() => tA).request('/x'));
    expect(res.status).toBe(200);
    expect(txCount).toBe(1);
    expect(((await res.json()) as { t: string }).t).toBe(tA);
  });

  test('boshqa tenant ichma-ich: jim o‘tkazib yuborilmaydi (xato)', async () => {
    const res = await build(() => tB).request('/x');
    expect(res.status).toBe(500);
  });
});
