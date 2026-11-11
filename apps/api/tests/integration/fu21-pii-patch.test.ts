/**
 * FU-21 / FU-23 — `patient.view_pii` backend'da majburlanadi (REAL DB, HTTP).
 *
 * Ruxsat real shablon permset bilan (Receptionist) va undan `patient.view_pii` olib
 * tashlangan custom rol bilan sinaladi, `@owner` bilan EMAS:
 *  - FU-21: view_pii'siz PATCH `phone/phoneSecondary/passport/address` → 403 va
 *    bemor O'ZGARMAYDI; PII bo'lmagan maydon (notes) ishlaydi; view_pii bilan hammasi ishlaydi.
 *  - FU-23: phone-check view_pii'siz ism QAYTARMAYDI — faqat `count`.
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env fu21-pii-patch`
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { ROLE_TEMPLATES } from '@dental/core';
import { patients, tenants, users } from '@dental/db-schema';
import { eq, sql } from 'drizzle-orm';
import { createApp } from '../../src/app.ts';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import { signAccess } from '../../src/lib/jwt.ts';

const permsOf = (name: string): string[] => {
  const tpl = ROLE_TEMPLATES.find((r) => r.name === name);
  if (!tpl) throw new Error(`template yo'q: ${name}`);
  return [...tpl.permissions];
};

const withTenant = <T>(tenantId: string, fn: (tx: DbOrTx) => Promise<T>): Promise<T> =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    return fn(tx);
  });

let tenantId: string;
let actorId: string;
let patientId: string;
let tokens: { pii: string; noPii: string };

const tokenFor = async (perms: string[]) =>
  (
    await signAccess({
      sub: actorId,
      atid: tenantId,
      abid: null,
      perms,
      roleKey: null,
      lang: 'uz',
    })
  ).token;

const app = createApp();
const patch = (body: unknown, token: string) =>
  app.request(`/api/patients/${patientId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
const check = (phone: string, token: string) =>
  app.request(`/api/patients/phone-check?phone=${encodeURIComponent(phone)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

const row = () =>
  withTenant(tenantId, async (tx) => {
    const [p] = await tx.select().from(patients).where(eq(patients.id, patientId));
    return p;
  });

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const [actor] = await db
    .insert(users)
    .values({ phone: '+998900000211', passwordHash: 'x', fullName: 'Actor FU21' })
    .returning({ id: users.id });
  if (!actor) throw new Error('user insert failed');
  actorId = actor.id;
  const [t] = await db
    .insert(tenants)
    .values({ name: 'FU21', slug: 'fu21', ownerUserId: actorId })
    .returning({ id: tenants.id });
  if (!t) throw new Error('tenant insert failed');
  tenantId = t.id;
  await withTenant(tenantId, async (tx) => {
    const [p] = await tx
      .insert(patients)
      .values({
        tenantId,
        fullName: 'Jasur PII',
        phone: '+998901234567',
        phoneSecondary: '+998931112233',
        passport: 'AB1234567',
        address: 'Toshkent',
      })
      .returning({ id: patients.id });
    if (!p) throw new Error('seed failed');
    patientId = p.id;
  });
  const reception = permsOf('Receptionist');
  tokens = {
    pii: await tokenFor(reception),
    noPii: await tokenFor(reception.filter((p) => p !== 'patient.view_pii')),
  };
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('FU-21 PATCH — PII maydonlari view_pii siz', () => {
  test.each([
    ['phone', { phone: '+998900000000' }],
    ['phoneSecondary', { phoneSecondary: '+998900000001' }],
    ['passport', { passport: 'ZZ0000000' }],
    ['address', { address: 'Boshqa joy' }],
    ['PII null bilan tozalash ham', { passport: null }],
    ['aralash (notes + phone)', { notes: 'x', phone: '+998900000002' }],
  ])('%s → 403 va bemor o‘zgarmaydi', async (_name, body) => {
    const res = await patch(body, tokens.noPii);
    expect(res.status).toBe(403);
    const after = await row();
    expect(after?.phone).toBe('+998901234567');
    expect(after?.phoneSecondary).toBe('+998931112233');
    expect(after?.passport).toBe('AB1234567');
    expect(after?.address).toBe('Toshkent');
    expect(after?.notes).toBeNull();
  });

  test('PII bo‘lmagan maydon (notes, fullName) view_pii siz ishlaydi', async () => {
    const res = await patch({ notes: 'yangilandi', fullName: 'Jasur Yangi' }, tokens.noPii);
    expect(res.status).toBe(200);
    expect((await row())?.notes).toBe('yangilandi');
  });

  test('view_pii bilan PII maydoni o‘zgaradi', async () => {
    const res = await patch({ address: 'Samarqand', phone: '901230000' }, tokens.pii);
    expect(res.status).toBe(200);
    const after = await row();
    expect(after?.address).toBe('Samarqand');
    expect(after?.phone).toBe('+998901230000');
  });
});

describe('FU-23 phone-check — view_pii siz faqat count', () => {
  test('view_pii bilan: ism + id + count', async () => {
    const res = await check('+998931112233', tokens.pii);
    const body = (await res.json()) as {
      data: { count: number; matches: { id: string; fullName: string }[] };
    };
    expect(body.data.count).toBe(1);
    expect(body.data.matches).toEqual([{ id: patientId, fullName: 'Jasur Yangi' }]);
  });

  test('view_pii siz: faqat count, matches bo‘sh (ism sizmaydi)', async () => {
    const res = await check('+998931112233', tokens.noPii);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain('Jasur');
    const body = JSON.parse(text) as { data: { count: number; matches: unknown[] } };
    expect(body.data.count).toBe(1);
    expect(body.data.matches).toEqual([]);
  });

  test('view_pii siz: mos kelmasa count = 0', async () => {
    const body = (await (await check('+998900009999', tokens.noPii)).json()) as {
      data: { count: number };
    };
    expect(body.data.count).toBe(0);
  });
});
