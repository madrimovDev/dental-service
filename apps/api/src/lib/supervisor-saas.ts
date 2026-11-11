import { tenantSettings, tenants, users } from '@dental/db-schema';
import { and, eq, isNotNull, isNull, lt, or } from 'drizzle-orm';
import type { Database } from '../db/client.ts';
import { withTenant } from '../db/scoped.ts';
import { logger } from './logger.ts';
import { invalidateSubscriptionCache } from './subscription.ts';

/**
 * L8 — SaaS tenantlarni Supervisor'da klinika sifatida ro'yxatga olish va
 * obuna muddatini sinxronlash. Faqat bulut (SaaS) rejimida; desktop
 * (`DENTAL_LOCAL_DESKTOP=true`) bu yo'ldan hech qachon o'tmaydi.
 *
 * Env har chaqiruvda qayta o'qiladi (frozen `env.ts` emas) — testlar o'zgartira
 * oladi. `SUPERVISOR_SAAS_TOKEN` (>=32 bayt) yo'q bo'lsa integratsiya O'CHIQ:
 * hech narsa yuborilmaydi, hech narsa bloklanmaydi.
 */
const DEFAULT_SUPERVISOR_URL = 'https://supervisor.dental.uz';
const REQUEST_TIMEOUT_MS = 5000;
/** Bitta siklda ro'yxatga olinadigan / sinxronlanadigan tenantlar yuqori chegarasi. */
const BATCH = 50;
/** Obuna holati shu vaqtdan eski bo'lsa qayta so'raladi (kunlik sinxron). */
const SYNC_STALE_MS = 20 * 60 * 60 * 1000;

export const isSaasSupervisorEnabled = (): boolean => {
  if (process.env.DENTAL_LOCAL_DESKTOP === 'true') return false;
  const token = process.env.SUPERVISOR_SAAS_TOKEN;
  return Boolean(token && Buffer.byteLength(token) >= 32);
};

const baseUrl = (): string =>
  (process.env.SUPERVISOR_URL || DEFAULT_SUPERVISOR_URL).replace(/\/+$/, '');

type FetchFn = typeof fetch;

export type SupervisorClinicInfo = {
  clinicId: string;
  /** ISO yoki null (Supervisor muddat bermagan). */
  subscriptionExpiresAt: string | null;
};

export type SaasRegistration = {
  tenantId: string;
  name: string;
  ownerFullName: string;
  ownerPhone: string;
  defaultLanguage: 'uz' | 'ru';
};

const call = async (fetchImpl: FetchFn, path: string, init: RequestInit): Promise<Response> =>
  fetchImpl(`${baseUrl()}/internal/saas${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.SUPERVISOR_SAAS_TOKEN}`,
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

const parseInfo = async (res: Response): Promise<SupervisorClinicInfo> => {
  const body = (await res.json()) as { clinicId?: string; subscriptionExpiresAt?: string | null };
  if (!body.clinicId) throw new Error('supervisor: clinicId missing');
  return { clinicId: body.clinicId, subscriptionExpiresAt: body.subscriptionExpiresAt ?? null };
};

/** Idempotent (Supervisor `saas_tenant_id` UNIQUE) — qayta chaqiruv xavfsiz. */
export const registerClinicInSupervisor = async (
  reg: SaasRegistration,
  fetchImpl: FetchFn = fetch,
): Promise<SupervisorClinicInfo> => {
  const res = await call(fetchImpl, '/clinics', { method: 'POST', body: JSON.stringify(reg) });
  if (res.status !== 200 && res.status !== 201)
    throw new Error(`supervisor register ${res.status}`);
  return parseInfo(res);
};

/** `null` = Supervisor bu tenantni bilmaydi (404) — qayta ro'yxatga olish kerak. */
export const fetchClinicStatus = async (
  tenantId: string,
  fetchImpl: FetchFn = fetch,
): Promise<SupervisorClinicInfo | null> => {
  const res = await call(fetchImpl, `/clinics/${tenantId}/status`, { method: 'GET' });
  if (res.status === 404) return null;
  if (res.status !== 200) throw new Error(`supervisor status ${res.status}`);
  return parseInfo(res);
};

/**
 * Tenant-scoped (RLS) upsert — qator bo'lmasa yaratadi. `withTenant` ishlatiladi
 * (admin conn shart emas): register-tenant yo'li admin ulanishsiz ham ishlashi kerak.
 */
const saveSupervisorState = async (tenantId: string, info: SupervisorClinicInfo): Promise<void> => {
  const subscriptionExpiresAt = info.subscriptionExpiresAt
    ? new Date(info.subscriptionExpiresAt)
    : null;
  const now = new Date();
  await withTenant(tenantId, (tx) =>
    tx
      .insert(tenantSettings)
      .values({
        tenantId,
        supervisorClinicId: info.clinicId,
        subscriptionExpiresAt,
        subscriptionSyncedAt: now,
      })
      .onConflictDoUpdate({
        target: tenantSettings.tenantId,
        set: {
          supervisorClinicId: info.clinicId,
          subscriptionExpiresAt,
          subscriptionSyncedAt: now,
          updatedAt: now,
        },
      }),
  );
  invalidateSubscriptionCache(tenantId);
};

export type SyncDeps = {
  /** RLS-bypass admin conn (cross-tenant) — Qaror #23. */
  adminDb: Database;
  fetchImpl?: FetchFn;
  now?: Date;
};

export type SyncResult = { registered: number; synced: number; failed: number };

/**
 * Bitta sikl: (1) hali ro'yxatga olinmagan tenantlarni Supervisor'ga yozadi
 * (register-tenant paytida Supervisor o'chiq bo'lgan / eski tenantlar), (2) obuna
 * holati eskirgan ro'yxatdagi tenantlar uchun muddatni yangilaydi. Har tenant
 * o'z try/catch'ida — bitta xato siklni to'xtatmaydi.
 */
export const runSupervisorSyncCycle = async (deps: SyncDeps): Promise<SyncResult> => {
  const result: SyncResult = { registered: 0, synced: 0, failed: 0 };
  if (!isSaasSupervisorEnabled()) return result;
  const f = deps.fetchImpl ?? fetch;
  const nowMs = (deps.now ?? new Date()).getTime();

  const pending = await deps.adminDb
    .select({
      tenantId: tenants.id,
      name: tenants.name,
      lang: tenants.defaultLanguage,
      ownerName: users.fullName,
      ownerPhone: users.phone,
    })
    .from(tenants)
    .innerJoin(users, eq(users.id, tenants.ownerUserId))
    .leftJoin(tenantSettings, eq(tenantSettings.tenantId, tenants.id))
    .where(isNull(tenantSettings.supervisorClinicId))
    .limit(BATCH);

  for (const t of pending) {
    try {
      const info = await registerClinicInSupervisor(
        {
          tenantId: t.tenantId,
          name: t.name,
          ownerFullName: t.ownerName ?? t.name,
          ownerPhone: t.ownerPhone ?? '',
          defaultLanguage: t.lang === 'ru' ? 'ru' : 'uz',
        },
        f,
      );
      await saveSupervisorState(t.tenantId, info);
      result.registered++;
    } catch (err) {
      result.failed++;
      logger.warn({ err, tenantId: t.tenantId }, 'supervisor register failed — will retry');
    }
  }

  const stale = await deps.adminDb
    .select({ tenantId: tenantSettings.tenantId })
    .from(tenantSettings)
    .where(
      and(
        isNotNull(tenantSettings.supervisorClinicId),
        or(
          isNull(tenantSettings.subscriptionSyncedAt),
          lt(tenantSettings.subscriptionSyncedAt, new Date(nowMs - SYNC_STALE_MS)),
        ),
      ),
    )
    .limit(BATCH);

  for (const s of stale) {
    try {
      const synced = await syncTenantSubscription(deps.adminDb, s.tenantId, f);
      if (synced) result.synced++;
    } catch (err) {
      result.failed++;
      logger.warn({ err, tenantId: s.tenantId }, 'supervisor status sync failed — will retry');
    }
  }
  return result;
};

/**
 * Bitta tenant muddatini Supervisor'dan oladi va saqlaydi. Supervisor tenantni
 * bilmasa (404) — qayta ro'yxatga oladi. `false` = integratsiya o'chiq.
 * «Qayta tekshirish» (blok ekrani) ham shuni chaqiradi — `readDb` faqat `tenants`/
 * `users` (RLS'siz platform jadvallari) o'qiydi, shuning uchun oddiy app `db` yetadi.
 */
export const syncTenantSubscription = async (
  readDb: Database,
  tenantId: string,
  fetchImpl: FetchFn = fetch,
): Promise<boolean> => {
  if (!isSaasSupervisorEnabled()) return false;
  let info = await fetchClinicStatus(tenantId, fetchImpl);
  if (!info) {
    const [t] = await readDb
      .select({
        name: tenants.name,
        lang: tenants.defaultLanguage,
        ownerName: users.fullName,
        ownerPhone: users.phone,
      })
      .from(tenants)
      .innerJoin(users, eq(users.id, tenants.ownerUserId))
      .where(eq(tenants.id, tenantId));
    if (!t) return false;
    info = await registerClinicInSupervisor(
      {
        tenantId,
        name: t.name,
        ownerFullName: t.ownerName ?? t.name,
        ownerPhone: t.ownerPhone ?? '',
        defaultLanguage: t.lang === 'ru' ? 'ru' : 'uz',
      },
      fetchImpl,
    );
  }
  await saveSupervisorState(tenantId, info);
  return true;
};

/**
 * Ro'yxatdan o'tgandan KEYIN (`onAfterCommit`, best-effort, timeout 2,5 s):
 * Supervisor'ga yozadi. Xatolik yutiladi — tenant allaqachon yaratilgan, qayta
 * urinishni sikl bajaradi (`runSupervisorSyncCycle`).
 */
export const registerTenantAfterCommit = async (
  reg: SaasRegistration,
  fetchImpl: FetchFn = fetch,
): Promise<void> => {
  if (!isSaasSupervisorEnabled()) return;
  const info = await registerClinicInSupervisor(reg, fetchImpl);
  await saveSupervisorState(reg.tenantId, info);
};

const INTERVAL_MS = 60 * 60 * 1000; // soatiga: retry tez, holat sinxroni 20 s eskirgach
const FIRST_RUN_DELAY_MS = 30_000;

/**
 * Davriy sikl (in-process `setInterval`, BullMQ'siz — vazifa kichik va idempotent).
 * Faqat SaaS+token bo'lganda ishga tushadi; qaytargan funksiya to'xtatadi.
 */
export const startSupervisorSyncScheduler = (deps: {
  adminDb: Database;
  intervalMs?: number;
  firstRunDelayMs?: number;
}): (() => void) => {
  if (!isSaasSupervisorEnabled()) return () => {};
  const run = () =>
    runSupervisorSyncCycle({ adminDb: deps.adminDb })
      .then((r) => {
        if (r.registered || r.synced || r.failed) logger.info(r, 'supervisor sync cycle');
      })
      .catch((err) => logger.warn({ err }, 'supervisor sync cycle crashed'));
  const first = setTimeout(run, deps.firstRunDelayMs ?? FIRST_RUN_DELAY_MS);
  const timer = setInterval(run, deps.intervalMs ?? INTERVAL_MS);
  logger.info('🔁 Supervisor SaaS sync scheduler started');
  return () => {
    clearTimeout(first);
    clearInterval(timer);
  };
};
