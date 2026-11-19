/**
 * FX-128 (LC-06): litsenziya (desktop `.lic`) yoki obuna (SaaS) `expired` bo'lsa
 * Lab Hub sinxron sikli (`runLabHubCycle` — outbox push + poll) shu tenant uchun
 * Hub'ga umuman murojaat qilmaydi: navbatdagi ish `pending` qoladi, kursor
 * surilmaydi; to'lovdan keyin keyingi siklda davom etadi. Faol tenant o'zgarmaydi.
 *
 * Real DB (RLS: `tenant_settings`, `lab_hub_state`, `lab_hub_outbox`) + haqiqiy
 * HTTP soxta Hub (`Bun.serve`) — har so'rov `Authorization` kaliti bo'yicha sanaladi.
 * Desktop holati `getLicenseState` orqali (haqiqiy modul spread, faqat shu eksport).
 *
 *   cd apps/api && bun test tests/integration/fx-128-lab-hub-expired-skip.test.ts --env-file=../../.env
 */
import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  branches,
  labHubOutbox,
  labHubState,
  labOrders,
  patients,
  tenantSettings,
  tenants,
  users,
} from '@dental/db-schema';
import { sql } from 'drizzle-orm';
import * as realLicense from '../../src/lib/license.ts';

let licenseState = 'active';
mock.module('../../src/lib/license.ts', () => ({
  ...realLicense,
  getLicenseState: async () => ({
    state: licenseState,
    expiresAt: null,
    graceEndsAt: null,
    daysLeft: null,
  }),
}));

const secretDir = mkdtempSync(join(tmpdir(), 'fx128-secret-'));
process.env.MESSAGING_SECRET_PATH = join(secretDir, 'messaging-secret.txt');

const { createAdminDb, db } = await import('../../src/db/client.ts');
const { withTenant } = await import('../../src/db/scoped.ts');
const { encryptSecret } = await import('../../src/lib/crypto.ts');
const { invalidateSubscriptionCache } = await import('../../src/lib/subscription.ts');
const { runLabHubCycle } = await import('../../src/lib/lab-hub/sync.ts');

const DAY = 86_400_000;
const admin = createAdminDb();

/** Soxta Hub: kalit → so'rovlar soni. */
const hits = new Map<string, number>();
const hub = Bun.serve({
  port: 0,
  fetch(req) {
    const key = (req.headers.get('Authorization') ?? '').replace(/^Bearer /, '');
    hits.set(key, (hits.get(key) ?? 0) + 1);
    const url = new URL(req.url);
    if (url.pathname === '/v1/clinic/changes') {
      return Response.json({ events: [], nextCursor: '9.9' });
    }
    return Response.json({ caseId: crypto.randomUUID(), status: 'sent', created: true });
  },
});

const saved = {
  desktop: process.env.DENTAL_LOCAL_DESKTOP,
  url: process.env.LAB_HUB_URL,
};

let ownerId: string;
let tExpired: string;
let tActive: string;
const KEY_EXPIRED = 'hub-key-fx128-expired';
const KEY_ACTIVE = 'hub-key-fx128-active';

const seedTenant = async (slug: string, expiresAt: Date, hubKey: string) => {
  const [t] = await db
    .insert(tenants)
    .values({ name: slug, slug, ownerUserId: ownerId, defaultLanguage: 'uz' })
    .returning({ id: tenants.id });
  const tenantId = t!.id;
  await withTenant(tenantId, async (tx) => {
    await tx.insert(tenantSettings).values({ tenantId, subscriptionExpiresAt: expiresAt });
    await tx.insert(branches).values({ tenantId, name: 'B' });
    const [p] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'Bemor', phone: `+99890${slug.length}128000` })
      .returning();
    const [o] = await tx
      .insert(labOrders)
      .values({
        tenantId,
        patientId: p!.id,
        doctorId: ownerId,
        labName: 'Hub Lab',
        orderType: 'crown',
        status: 'draft',
        items: [],
      })
      .returning();
    await tx.insert(labHubState).values({ tenantId, hubKeyEnc: encryptSecret(hubKey) });
    await tx.insert(labHubOutbox).values({
      tenantId,
      labOrderId: o!.id,
      op: 'upsert_case',
      payload: {},
    });
  });
  return tenantId;
};

const stateOf = (tenantId: string) =>
  withTenant(tenantId, async (tx) => {
    const [s] = await tx.select({ cursor: labHubState.cursor }).from(labHubState);
    const out = await tx.select({ status: labHubOutbox.status }).from(labHubOutbox);
    return { cursor: s!.cursor, outbox: out.map((r) => r.status) };
  });

beforeAll(async () => {
  process.env.LAB_HUB_URL = `http://127.0.0.1:${hub.port}`;
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900000128', passwordHash: 'x', fullName: 'Doc' })
    .returning({ id: users.id });
  ownerId = owner!.id;
  // Muddat + 7 kun imtiyoz o'tgan → expired.
  tExpired = await seedTenant('fx128-expired', new Date(Date.now() - 30 * DAY), KEY_EXPIRED);
  tActive = await seedTenant('fx128-active', new Date(Date.now() + 30 * DAY), KEY_ACTIVE);
});

afterAll(async () => {
  hub.stop(true);
  for (const [k, v] of Object.entries({
    DENTAL_LOCAL_DESKTOP: saved.desktop,
    LAB_HUB_URL: saved.url,
  })) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  await admin.client.end({ timeout: 5 });
  rmSync(secretDir, { recursive: true, force: true });
});

beforeEach(() => {
  hits.clear();
  invalidateSubscriptionCache();
});

describe('FX-128 Lab Hub sikli — expired tenant o`tkazib yuboriladi', () => {
  test('SaaS: expired obuna — Hub so`rovi yo`q, outbox pending, kursor joyida; faol tenant sinxronlanadi', async () => {
    delete process.env.DENTAL_LOCAL_DESKTOP;
    await runLabHubCycle({ adminDb: admin.db });

    expect(hits.get(KEY_EXPIRED) ?? 0).toBe(0);
    expect(await stateOf(tExpired)).toEqual({ cursor: '0.0', outbox: ['pending'] });

    expect(hits.get(KEY_ACTIVE) ?? 0).toBeGreaterThan(0);
    expect((await stateOf(tActive)).cursor).toBe('9.9');
  });

  test('Desktop: `.lic` expired — hech bir tenant Hub`ga murojaat qilmaydi', async () => {
    process.env.DENTAL_LOCAL_DESKTOP = 'true';
    licenseState = 'expired';
    // Faol tenantning kursorini qaytaramiz — o'zgarmasligi tekshiriladi.
    await withTenant(tActive, (tx) => tx.update(labHubState).set({ cursor: '0.0' }));
    await runLabHubCycle({ adminDb: admin.db });

    expect(hits.size).toBe(0);
    expect((await stateOf(tActive)).cursor).toBe('0.0');
  });

  test('Desktop: `.lic` grace — sinxron davom etadi (imtiyozda bloklanmaydi)', async () => {
    process.env.DENTAL_LOCAL_DESKTOP = 'true';
    licenseState = 'grace';
    await runLabHubCycle({ adminDb: admin.db });
    expect(hits.get(KEY_ACTIVE) ?? 0).toBeGreaterThan(0);
  });
});
