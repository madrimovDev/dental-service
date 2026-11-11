/**
 * UI-R6 Bemorlar — qidiruv, belgilar, telefon dublikati, PII maskalash (REAL DB, HTTP).
 *
 * Ruxsat real shablon permset bilan sinaladi (Receptionist / Doctor), `@owner` bilan EMAS:
 *  - Receptionist (view_pii BOR): kirill «турсун» ↔ «Tursun»; istalgan formatdagi telefon;
 *    flags; phone-check; emergency kontakt telefoni ochiq.
 *  - Receptionist minus `patient.view_pii` (custom rol): telefon/passport bo'yicha qidiruv
 *    NATIJA BERMAYDI (PT-03), PATCH javobi va emergency kontakt maskalangan (PT-01/02).
 *  - Doctor (patient.create YO'Q): phone-check 403.
 *  - RLS: boshqa tenantdagi bir xil telefon dublikat sifatida chiqmaydi.
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env ui-r6-patients-search`
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { ROLE_TEMPLATES } from '@dental/core';
import {
  medicalRecords,
  patientEmergencyContacts,
  patients,
  tenants,
  users,
} from '@dental/db-schema';
import { sql } from 'drizzle-orm';
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

let tenantA: string;
let tenantB: string;
let actorId: string;
let tokens: { reception: string; noPii: string; doctor: string };
let ids: { tursun: string; cyr: string; allergic: string; telegram: string; archived: string };

const tokenFor = async (perms: string[]) =>
  (
    await signAccess({
      sub: actorId,
      atid: tenantA,
      abid: null,
      perms,
      roleKey: null,
      lang: 'uz',
    })
  ).token;

const app = createApp();
const get = (path: string, token: string) =>
  app.request(`/api/patients${path}`, { headers: { Authorization: `Bearer ${token}` } });
const names = async (res: Response): Promise<string[]> => {
  const body = (await res.json()) as { data: { data: { fullName: string }[] } };
  return body.data.data.map((p) => p.fullName).sort();
};

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const [actor] = await db
    .insert(users)
    .values({ phone: '+998900000061', passwordHash: 'x', fullName: 'Receptionist R6' })
    .returning({ id: users.id });
  if (!actor) throw new Error('user insert failed');
  actorId = actor.id;

  const [a, b] = await db
    .insert(tenants)
    .values([
      { name: 'R6 Clinic A', slug: 'r6-clinic-a', ownerUserId: actorId },
      { name: 'R6 Clinic B', slug: 'r6-clinic-b', ownerUserId: actorId },
    ])
    .returning({ id: tenants.id });
  if (!a || !b) throw new Error('tenant insert failed');
  tenantA = a.id;
  tenantB = b.id;

  await withTenant(tenantA, async (tx) => {
    const [tursun, cyr, allergic, telegram, archived] = await tx
      .insert(patients)
      .values([
        { tenantId: tenantA, fullName: 'Jasur Tursunov', phone: '+998901234567' },
        { tenantId: tenantA, fullName: 'Турсунбой Алиев', phone: '+998933334455' },
        { tenantId: tenantA, fullName: 'Malika Allergik', phone: '+998944445566' },
        {
          tenantId: tenantA,
          fullName: 'Nodira Telegram',
          phone: '+998955556677',
          telegramChatId: '12345',
          passport: 'AB1234567',
        },
        {
          tenantId: tenantA,
          fullName: 'Arxiv Bemor',
          phone: '+998977778899',
          archivedAt: new Date(),
        },
      ])
      .returning({ id: patients.id });
    if (!tursun || !cyr || !allergic || !telegram || !archived) throw new Error('seed failed');
    ids = {
      tursun: tursun.id,
      cyr: cyr.id,
      allergic: allergic.id,
      telegram: telegram.id,
      archived: archived.id,
    };
    await tx.insert(medicalRecords).values({
      tenantId: tenantA,
      patientId: allergic.id,
      allergies: [{ type: 'medication', substance: 'Penitsillin', severity: 'severe' }],
    });
    await tx.insert(patientEmergencyContacts).values({
      tenantId: tenantA,
      patientId: tursun.id,
      name: 'Yaqin',
      phone: '+998909998877',
      isPrimary: true,
    });
  });

  // Boshqa tenantda BIR XIL telefon — dublikat sifatida chiqmasligi kerak (RLS).
  await withTenant(tenantB, (tx) =>
    tx
      .insert(patients)
      .values({ tenantId: tenantB, fullName: 'B Tenant Bemor', phone: '+998901234567' }),
  );

  const reception = permsOf('Receptionist');
  tokens = {
    reception: await tokenFor(reception),
    noPii: await tokenFor(reception.filter((p) => p !== 'patient.view_pii')),
    doctor: await tokenFor(permsOf('Doctor')),
  };
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('UI-R6 qidiruv (Receptionist, view_pii bor)', () => {
  test('lotin «Tursun» kirillcha saqlangan «Турсунбой» ni ham topadi', async () => {
    const res = await get('?search=Tursun', tokens.reception);
    expect(res.status).toBe(200);
    expect(await names(res)).toEqual(['Jasur Tursunov', 'Турсунбой Алиев']);
  });

  test('kirill «турсун» lotincha «Tursunov» ni ham topadi', async () => {
    const res = await get(`?search=${encodeURIComponent('турсун')}`, tokens.reception);
    expect(await names(res)).toEqual(['Jasur Tursunov', 'Турсунбой Алиев']);
  });

  test.each([
    '90 123 45 67',
    '+998901234567',
    '901234567',
    '+998 (90) 123-45-67',
  ])('telefon «%s» bir bemorni topadi', async (phone) => {
    const res = await get(`?search=${encodeURIComponent(phone)}`, tokens.reception);
    expect(await names(res)).toEqual(['Jasur Tursunov']);
  });

  test('ro‘yxat DTO belgilari: allergiya, Telegram, qarz, noShows', async () => {
    const res = await get('?pageSize=50', tokens.reception);
    const body = (await res.json()) as {
      data: {
        data: {
          id: string;
          flags: { allergy: boolean; debt: boolean; noShows: number; telegram: boolean };
        }[];
      };
    };
    const byId = new Map(body.data.data.map((p) => [p.id, p.flags]));
    expect(byId.get(ids.allergic)).toEqual({
      allergy: true,
      debt: false,
      noShows: 0,
      telegram: false,
    });
    expect(byId.get(ids.telegram)).toEqual({
      allergy: false,
      debt: false,
      noShows: 0,
      telegram: true,
    });
    expect(byId.get(ids.tursun)?.allergy).toBe(false);
  });

  test('allergiya MAZMUNI ro‘yxat javobida YO‘Q', async () => {
    const text = await (await get('?pageSize=50', tokens.reception)).text();
    expect(text).not.toContain('Penitsillin');
  });
});

describe('UI-R6 PT-03/PT-01/PT-02 — view_pii siz', () => {
  test('PT-03: telefon bo‘yicha qidiruv natija bermaydi (oracle yo‘q)', async () => {
    const res = await get('?search=901234567', tokens.noPii);
    expect(res.status).toBe(200);
    expect(await names(res)).toEqual([]);
  });

  test('PT-03: passport bo‘yicha qidiruv natija bermaydi', async () => {
    const res = await get('?search=AB1234567', tokens.noPii);
    expect(await names(res)).toEqual([]);
  });

  test('ism bo‘yicha qidiruv ishlaydi, telefon maskalangan', async () => {
    const res = await get('?search=Tursun', tokens.noPii);
    const body = (await res.json()) as { data: { data: { phone: string | null }[] } };
    expect(body.data.data.length).toBe(2);
    for (const p of body.data.data) expect(p.phone).toMatch(/^\*+\d{4}$/);
  });

  test('PT-01: PATCH javobi PII ni maskalaydi', async () => {
    const res = await app.request(`/api/patients/${ids.telegram}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${tokens.noPii}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: 'yangilandi' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { phone: string; passport: string; notes: string };
    };
    expect(body.data.notes).toBe('yangilandi');
    expect(body.data.phone).not.toContain('955556677');
    expect(body.data.phone).toMatch(/^\*+6677$/);
    expect(body.data.passport).toBe('***');
  });

  test('PT-02: emergency kontakt telefoni maskalanadi; view_pii bilan ochiq', async () => {
    const masked = await get(`/${ids.tursun}/emergency-contacts`, tokens.noPii);
    const m = (await masked.json()) as { data: { phone: string }[] };
    expect(m.data[0]?.phone).toMatch(/^\*+8877$/);

    const open = await get(`/${ids.tursun}/emergency-contacts`, tokens.reception);
    const o = (await open.json()) as { data: { phone: string }[] };
    expect(o.data[0]?.phone).toBe('+998909998877');
  });
});

describe('UI-R6 phone-check', () => {
  const check = (phone: string, token: string) =>
    get(`/phone-check?phone=${encodeURIComponent(phone)}`, token);

  test('mavjud telefon (istalgan format) → faqat id + fullName', async () => {
    const res = await check('90 123 45 67', tokens.reception);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { matches: Record<string, unknown>[] } };
    expect(body.data.matches).toEqual([{ id: ids.tursun, fullName: 'Jasur Tursunov' }]);
  });

  test('boshqa tenantdagi bir xil telefon chiqmaydi (RLS) — faqat A tenant bemori', async () => {
    const res = await check('+998901234567', tokens.reception);
    const body = (await res.json()) as { data: { matches: { fullName: string }[] } };
    expect(body.data.matches.map((m) => m.fullName)).toEqual(['Jasur Tursunov']);
  });

  test('yangi telefon → bo‘sh; to‘liq bo‘lmagan raqam → bo‘sh', async () => {
    const fresh = (await (await check('+998900001122', tokens.reception)).json()) as {
      data: { matches: unknown[] };
    };
    expect(fresh.data.matches).toEqual([]);
    const partial = (await (await check('9012', tokens.reception)).json()) as {
      data: { matches: unknown[] };
    };
    expect(partial.data.matches).toEqual([]);
  });

  test('arxivlangan bemor telefoni dublikat emas', async () => {
    const res = await check('+998977778899', tokens.reception);
    const body = (await res.json()) as { data: { matches: unknown[] } };
    expect(body.data.matches).toEqual([]);
  });

  test('Doctor (patient.create yo‘q) → 403', async () => {
    const res = await check('+998901234567', tokens.doctor);
    expect(res.status).toBe(403);
  });
});
