import { eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { clinics, licenses } from '../../db/schema';
import { hubToken } from './hub-token';

/**
 * Klinikaning Lab Hub uchun holati — `GET /internal/clinics/:id/verify` va
 * Supervisor → Hub push (`POST <LAB_HUB_URL>/internal/clinics`) bir xil manbadan.
 *
 *  - `desktop`: faol litsenziyalar bo'yicha (eng kech `expiresAt`); hammasi
 *    bekor qilingan bo'lsa `active=false`.
 *  - `saas`: litsenziya yo'q — `clinics.subscription_expires_at`; muddat
 *    belgilanmagan bo'lsa `active=false`.
 */
export type ClinicHubState = {
  clinicId: string;
  name: string;
  mode: 'desktop' | 'saas';
  active: boolean;
  expiresAt: Date | null;
  /** Faqat desktop: faol litsenziya kalitlari (javobda QAYTMAYDI, faqat moslik uchun). */
  activeLicenseKeys: string[];
};

export const loadClinicHubState = async (clinicId: string): Promise<ClinicHubState | null> => {
  const clinic = await db.query.clinics.findFirst({ where: eq(clinics.id, clinicId) });
  if (!clinic) return null;
  if (clinic.mode === 'saas') {
    return {
      clinicId: clinic.id,
      name: clinic.name,
      mode: 'saas',
      active: clinic.subscriptionExpiresAt !== null,
      expiresAt: clinic.subscriptionExpiresAt,
      activeLicenseKeys: [],
    };
  }
  const rows = await db.select().from(licenses).where(eq(licenses.clinicId, clinicId));
  const active = rows.filter((l) => l.isActive);
  const latest = active.reduce<Date | null>(
    (max, l) => (!max || l.expiresAt > max ? l.expiresAt : max),
    null,
  );
  return {
    clinicId: clinic.id,
    name: clinic.name,
    mode: 'desktop',
    active: active.length > 0,
    expiresAt: latest,
    activeLicenseKeys: active.map((l) => l.licenseKey),
  };
};

export type HubPushResult = 'pushed' | 'skipped' | 'failed';

/**
 * Vendor amalidan (renew / deactivate) keyin yangi holatni Hub'ga BEST-EFFORT
 * yuboradi: `LAB_HUB_URL` yoki token sozlanmagan bo'lsa — jim o'tkazib yuboradi;
 * Hub javob bermasa/xato bersa — log va `'failed'`, HECH QACHON throw qilmaydi
 * (vendor amali Hub'ga bog'liq bo'lmasligi kerak). Hub o'zi ham bloklangan
 * klinikani har 10 daqiqada, faolini har 24 soatda `verify` bilan qayta
 * tekshiradi — push faqat kechikishni qisqartiradi.
 *
 * Faol emas → `expiresAt: null` (Hub buni darhol `expired` deb biladi).
 */
export const pushClinicToHub = async (
  clinicId: string,
  opts: { fetch?: typeof fetch; timeoutMs?: number } = {},
): Promise<HubPushResult> => {
  const base = process.env.LAB_HUB_URL;
  const token = hubToken();
  if (!base || !token) return 'skipped';
  try {
    const state = await loadClinicHubState(clinicId);
    if (!state) return 'skipped';
    const res = await (opts.fetch ?? fetch)(new URL('/internal/clinics', base).toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        supervisorClinicId: state.clinicId,
        mode: state.mode,
        name: state.name,
        expiresAt: state.active && state.expiresAt ? state.expiresAt.toISOString() : null,
      }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 3000),
    });
    if (!res.ok) {
      console.warn(`[supervisor] Lab Hub push failed for clinic ${clinicId}: HTTP ${res.status}`);
      return 'failed';
    }
    return 'pushed';
  } catch (err) {
    console.warn(
      `[supervisor] Lab Hub push failed for clinic ${clinicId}: ${(err as Error).message}`,
    );
    return 'failed';
  }
};
