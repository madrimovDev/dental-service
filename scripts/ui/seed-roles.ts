/**
 * Rol bo'yicha skrinshotlar uchun tenant + xodimlar seed (HTTP orqali, real API).
 *   bun scripts/ui/seed-roles.ts --base http://localhost:8041 --out /tmp/claude-1000/ui0/creds.json
 * register-tenant → owner login → har rol shabloni uchun xodim invite → vaqtinchalik
 * parol bilan kirib majburiy parol almashtirish. Custom rol = faqat patient.view + appointment.view.
 */
import { writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const get = (k: string) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const base = (get('base') ?? 'http://localhost:8041').replace(/\/$/, '');
const out = get('out') ?? '/tmp/claude-1000/ui0/creds.json';
const PASSWORD = 'Seed-Parol-2026!x';
const stamp = Date.now().toString().slice(-6);
// rate-limit chelaklari bir-biriga urilmasin
const ip = `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

type Json = Record<string, any>;
async function call(method: string, path: string, body?: unknown, token?: string): Promise<Json> {
  const res = await fetch(`${base}/api${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-real-ip': ip,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Json;
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(json)}`);
  return json.data ?? json;
}

const tenantName = `UI Klinika ${stamp}`;
const ownerPhone = `+99890${stamp}1`.slice(0, 13).padEnd(13, '0');
const phoneFor = (n: number) => `+99891${stamp}${n}`.slice(0, 13).padEnd(13, '0');

await call('POST', '/auth/register-tenant', {
  tenantName,
  ownerPhone,
  ownerFullName: 'Owner Seed',
  ownerPassword: PASSWORD,
  defaultLanguage: 'uz',
});

async function workspaceToken(phone: string, password: string) {
  const login = await call('POST', '/auth/login', { phone, password });
  if (login.mustChangePassword) throw new Error('mustChangePassword — avval almashtiring');
  const mem = await call('GET', '/auth/me', undefined, login.accessToken);
  const a = mem.assignments?.[0] ?? mem.ownerTenants?.[0];
  if (!a) throw new Error(`a'zolik yo'q: ${phone}`);
  const ws = await call(
    'POST',
    '/auth/switch-workspace',
    { tenantId: a.tenantId, branchId: a.branchId ?? undefined, refreshToken: login.refreshToken },
    login.accessToken,
  );
  return ws.accessToken as string;
}

const ownerToken = await workspaceToken(ownerPhone, PASSWORD);
const roles = (await call('GET', '/roles', undefined, ownerToken)) as unknown as Array<Json>;
const roleId = (name: string) => {
  const r = roles.find((x) => x.name === name);
  if (!r) throw new Error(`rol topilmadi: ${name}`);
  return r.id as string;
};
const custom = await call(
  'POST',
  '/roles',
  { name: 'Custom Seed', permissions: ['patient.view', 'appointment.view'] },
  ownerToken,
);

const plan: Array<[string, string, string]> = [
  ['receptionist', 'Receptionist', roleId('Receptionist')],
  ['doctor', 'Doctor', roleId('Doctor')],
  ['technician', 'Technician', roleId('Technician')],
  ['accountant', 'Accountant', roleId('Accountant')],
  ['custom', 'Custom Seed', custom.id as string],
];
const users: Record<string, { phone: string; password: string }> = {
  owner: { phone: ownerPhone, password: PASSWORD },
};
let n = 1;
for (const [key, label, id] of plan) {
  const phone = phoneFor(n++);
  const inv = await call(
    'POST',
    '/users/invite',
    { phone, fullName: `${label} Seed`, roleId: id },
    ownerToken,
  );
  if (!inv.tempPassword) throw new Error(`${key}: tempPassword yo'q (${JSON.stringify(inv)})`);
  const login = await call('POST', '/auth/login', { phone, password: inv.tempPassword });
  await call(
    'POST',
    '/auth/change-password',
    { currentPassword: inv.tempPassword, newPassword: PASSWORD },
    login.accessToken,
  );
  users[key] = { phone, password: PASSWORD };
}

writeFileSync(out, JSON.stringify({ tenant: tenantName, users }, null, 2));
console.log(`creds -> ${out}`);
