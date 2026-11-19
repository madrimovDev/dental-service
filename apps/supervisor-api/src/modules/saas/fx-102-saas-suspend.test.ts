import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { and, eq } from 'drizzle-orm';
import { createApp } from '../../app';
import { db } from '../../db/client';
import { clinicEvents } from '../../db/schema';
import { signAdminTestToken } from '../../lib/test-helpers';
import { loadClinicHubState } from '../hub/clinic-state';

/**
 * FX-102 (LB-11): vendor SaaS klinikani to'xtata oladi. `PATCH /deactivate`
 * desktop'da litsenziyani bekor qiladi; SaaS klinikada (litsenziya yo'q) endi
 * obunani TO'XTATADI — `clinic_events` `saas_suspended` + status javobida
 * `suspendedAt` (apps/api imtiyozsiz bloklaydi) + Lab Hub holati `active=false`.
 * Keyingi «Muddatni uzaytirish» to'xtatishni yechadi. Real Supervisor DB.
 */
const SAAS_TOKEN = 'fx102-saas-test-token-0123456789-abcdefghijk';
const app = createApp();
const prev = process.env.SUPERVISOR_SAAS_TOKEN;
beforeAll(() => {
  process.env.SUPERVISOR_SAAS_TOKEN = SAAS_TOKEN;
});
afterAll(() => {
  if (prev === undefined) delete process.env.SUPERVISOR_SAAS_TOKEN;
  else process.env.SUPERVISOR_SAAS_TOKEN = prev;
});

const saasHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${SAAS_TOKEN}` };
const adminHeaders = async () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${await signAdminTestToken('fx102-admin')}`,
});
const registerSaas = async (tenantId: string) =>
  (await (
    await app.request('/internal/saas/clinics', {
      method: 'POST',
      headers: saasHeaders,
      body: JSON.stringify({
        tenantId,
        name: 'FX102 SaaS',
        ownerFullName: 'Sardor Aliyev',
        ownerPhone: '901112299',
      }),
    })
  ).json()) as { clinicId: string };
const status = async (tenantId: string) =>
  (await (
    await app.request(`/internal/saas/clinics/${tenantId}/status`, { headers: saasHeaders })
  ).json()) as { subscriptionExpiresAt: string | null; suspendedAt: string | null };

describe('FX-102 — SaaS klinikani vendor to‘xtatadi', () => {
  it('yangi SaaS klinika to‘xtatilmagan (suspendedAt null)', async () => {
    const tenantId = crypto.randomUUID();
    await registerSaas(tenantId);
    expect((await status(tenantId)).suspendedAt).toBeNull();
  });

  it('deactivate → 200, status suspendedAt, audit, Hub active=false; renew → yechiladi', async () => {
    const tenantId = crypto.randomUUID();
    const { clinicId } = await registerSaas(tenantId);
    const before = await status(tenantId);

    const res = await app.request(`/v1/admin/clinics/${clinicId}/deactivate`, {
      method: 'PATCH',
      headers: await adminHeaders(),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { suspendedAt: string | null };
    expect(body.suspendedAt).toBeTruthy();

    const s = await status(tenantId);
    expect(s.suspendedAt).toBe(body.suspendedAt);
    // Muddat o'zi o'zgarmaydi (renew'da qayta ishlatiladi) — blok `suspendedAt` orqali.
    expect(s.subscriptionExpiresAt).toBe(before.subscriptionExpiresAt);

    const events = await db
      .select()
      .from(clinicEvents)
      .where(and(eq(clinicEvents.clinicId, clinicId), eq(clinicEvents.event, 'saas_suspended')));
    expect(events).toHaveLength(1);
    expect((events[0]?.metadata as { createdBy?: string }).createdBy).toBe('fx102-admin');

    expect((await loadClinicHubState(clinicId))?.active).toBe(false);

    // Detal sahifasi to'xtatilganini ko'rsatadi.
    const detail = (await (
      await app.request(`/v1/admin/clinics/${clinicId}`, { headers: await adminHeaders() })
    ).json()) as { saasSuspendedAt: string | null };
    expect(detail.saasSuspendedAt).toBe(body.suspendedAt);

    const renew = await app.request(`/v1/admin/clinics/${clinicId}/renew`, {
      method: 'POST',
      headers: await adminHeaders(),
      body: JSON.stringify({ expiresAt: '2099-03-31' }),
    });
    expect(renew.status).toBe(200);
    const after = await status(tenantId);
    expect(after.suspendedAt).toBeNull();
    expect(after.subscriptionExpiresAt).toBe('2099-03-31T23:59:59.000Z');
    expect((await loadClinicHubState(clinicId))?.active).toBe(true);
  });

  it('qayta deactivate idempotent: yangi audit yozilmaydi, suspendedAt o‘zgarmaydi', async () => {
    const tenantId = crypto.randomUUID();
    const { clinicId } = await registerSaas(tenantId);
    const first = (await (
      await app.request(`/v1/admin/clinics/${clinicId}/deactivate`, {
        method: 'PATCH',
        headers: await adminHeaders(),
      })
    ).json()) as { suspendedAt: string };
    const second = await app.request(`/v1/admin/clinics/${clinicId}/deactivate`, {
      method: 'PATCH',
      headers: await adminHeaders(),
    });
    expect(second.status).toBe(200);
    expect(((await second.json()) as { suspendedAt: string }).suspendedAt).toBe(first.suspendedAt);
    const events = await db
      .select()
      .from(clinicEvents)
      .where(and(eq(clinicEvents.clinicId, clinicId), eq(clinicEvents.event, 'saas_suspended')));
    expect(events).toHaveLength(1);
  });
});
