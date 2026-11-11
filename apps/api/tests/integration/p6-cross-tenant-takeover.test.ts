/**
 * P6 — tenantlararo parol tiklash (account takeover) yopilganini tasdiqlaydi.
 * REAL HTTP (`createApp()`) + real DB. Hujum: hujumchi ommaviy `register-tenant` bilan o'z
 * klinikasini ochadi, qurbonni (BOSHQA klinika egasini) `invite` bilan o'z klinikasiga a'zo
 * qiladi va `reset-password` chaqiradi. Endi 403 `user.reset_other_tenant_owner`.
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env --timeout 30000 tests/integration/p6-cross-tenant-takeover.test.ts`
 */
import { afterAll, describe, expect, test } from 'bun:test';
import { createApp } from '../../src/app.ts';
import { closeRateLimitRedis } from '../../src/lib/rate-limit.ts';

const rnd = () => `10.77.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

const call = async (token: string | null, method: string, path: string, body?: unknown) => {
  const res = await createApp().request(`/api${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-real-ip': rnd(),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {}
  return { status: res.status, json };
};

afterAll(async () => {
  await closeRateLimitRedis();
});

const register = async (name: string, phone: string, password: string) => {
  const r = await call(null, 'POST', '/auth/register-tenant', {
    tenantName: name,
    ownerPhone: phone,
    ownerFullName: name,
    ownerPassword: password,
  });
  expect(r.status).toBe(201);
};

const loginIntoOwnTenant = async (phone: string, password: string) => {
  const l = await call(null, 'POST', '/auth/login', { phone, password });
  expect(l.status).toBe(200);
  const me = await call(l.json.data.accessToken, 'GET', '/auth/me');
  const tenantId = me.json.data.ownerTenants[0].tenantId as string;
  const sw = await call(l.json.data.accessToken, 'POST', '/auth/switch-workspace', {
    tenantId,
    refreshToken: l.json.data.refreshToken,
  });
  expect(sw.status).toBe(200);
  return { token: sw.json.data.accessToken as string, tenantId };
};

describe('P6 cross-tenant takeover', () => {
  test('hujumchi o‘z klinikasiga qurbon-egani invite qilib, parolini tiklay olmaydi', async () => {
    const sfx = String(Math.floor(Math.random() * 9000000) + 1000000);
    const victimPhone = `+99891${sfx}`;
    const attackerPhone = `+99893${sfx}`;
    const victimPassword = 'VictimPassword123!';

    await register('Victim Clinic', victimPhone, victimPassword);
    await register('Attacker Clinic', attackerPhone, 'AttackerPassword123!');
    const attacker = await loginIntoOwnTenant(attackerPhone, 'AttackerPassword123!');

    const roles = await call(attacker.token, 'GET', '/roles');
    const roleId = roles.json.data[0].id as string;
    const inv = await call(attacker.token, 'POST', '/users/invite', {
      phone: victimPhone,
      fullName: 'whatever',
      roleId,
    });
    expect(inv.status).toBe(201);
    const victimId = inv.json.data.userId as string;

    const rst = await call(attacker.token, 'POST', `/users/${victimId}/reset-password`);
    expect(rst.status).toBe(403);
    expect(rst.json.error.code).toBe('user.reset_other_tenant_owner');
    expect(rst.json.data?.tempPassword).toBeUndefined();

    // Qurbonning eski paroli o'zgarmagan va u o'z klinikasiga hamon kira oladi
    const victim = await call(null, 'POST', '/auth/login', {
      phone: victimPhone,
      password: victimPassword,
    });
    expect(victim.status).toBe(200);
    expect(victim.json.data.mustChangePassword).toBe(false);
  });

  test('o‘z klinikasi a’zosi (boshqa klinika egasi emas) uchun tiklash ishlaydi', async () => {
    const sfx = String(Math.floor(Math.random() * 9000000) + 1000000);
    const ownerPhone = `+99894${sfx}`;
    const staffPhone = `+99895${sfx}`;
    await register('Normal Clinic', ownerPhone, 'OwnerPassword123!');
    const owner = await loginIntoOwnTenant(ownerPhone, 'OwnerPassword123!');
    const roles = await call(owner.token, 'GET', '/roles');
    const inv = await call(owner.token, 'POST', '/users/invite', {
      phone: staffPhone,
      fullName: 'Staff',
      roleId: roles.json.data[0].id,
    });
    expect(inv.status).toBe(201);
    const rst = await call(owner.token, 'POST', `/users/${inv.json.data.userId}/reset-password`);
    expect(rst.status).toBe(200);
    expect(typeof rst.json.data.tempPassword).toBe('string');
  });
});
