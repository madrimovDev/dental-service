import { getFingerprint, type LicenseData, readLicense } from './license';

// Compile-time constant (bun build --compile --define ishlatiladi)
// Foydalanuvchi o'zgartira olmaydi — xavfsizlik chegarasi
export const SUPERVISOR_URL = process.env.SUPERVISOR_URL ?? 'https://supervisor.dental.uz';

/**
 * Supervisor aktivatsiya javobidagi provisioning bloki — klinika bazasini
 * (tenant + owner + filial) birinchi ishga tushirishda to'ldirish uchun.
 *
 * ⚠️ LOCKSTEP: bu tip `apps/supervisor-api/src/modules/licenses/licenses.service.ts`
 * dagi `ProvisioningBlock` bilan AYNAN bir xil bo'lishi shart (ikki app alohida
 * deploy unit — workspace import qirrasi yo'q, `license-signature.ts` precedenti).
 * Blok RSA imzo bilan tekshiriladi, shuning uchun QAT'IY TEKIS (nested obyekt
 * yo'q) va barcha 11 maydon MAJBURIY `string` — bo'sh qiymat `''` bilan
 * beriladi. Maydonni ixtiyoriy qilish imzo canonicalization'ini buzadi.
 */
export type ProvisioningBlock = {
  licenseKey: string;
  clinicId: string;
  issuedAt: string;
  tenantName: string;
  defaultLanguage: string;
  ownerFullName: string;
  ownerPhone: string;
  ownerPassword: string;
  branchName: string;
  branchAddress: string;
  branchPhone: string;
};

/**
 * `/v1/activate` javobi — `LicenseData` ustiga ixtiyoriy provisioning qo'shiladi.
 * Klinika allaqachon provision qilingan bo'lsa Supervisor blokni qaytarmaydi.
 */
export type ActivateResult = LicenseData & {
  provisioning?: ProvisioningBlock;
  provisioningSignature?: string;
};

const post = async <T = LicenseData>(path: string, body: object): Promise<T> => {
  const res = await fetch(`${SUPERVISOR_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { error?: { code?: string } };
  if (!res.ok) {
    throw new Error(json?.error?.code ?? 'SUPERVISOR_ERROR');
  }
  return json as T;
};

export const activateLicense = async (licenseKey: string): Promise<ActivateResult> => {
  const fingerprint = await getFingerprint();
  return post<ActivateResult>('/v1/activate', { licenseKey, fingerprint });
};

export const sendHeartbeat = async (licenseKey: string): Promise<LicenseData> => {
  const fingerprint = await getFingerprint();
  return post('/v1/heartbeat', { licenseKey, fingerprint });
};

/**
 * Provisioning muvaffaqiyatli qo'llangani haqida Supervisor'ga xabar beradi —
 * u vaqtinchalik owner parolini bazasidan o'chiradi.
 *
 * BEST-EFFORT: hech qanday holatda throw QILMAYDI (tarmoq xatosi, fingerprint
 * hisoblab bo'lmasligi — VM/konteyner, Supervisor 5xx). Aktivatsiya oqimi bu
 * chaqiruv tufayli buzilmasligi kerak; tasdiq yetib bormasa Supervisor keyingi
 * heartbeat'da parolni baribir tozalaydi. Shu sababli javob `res.ok`/`res.json()`
 * ATAYIN tekshirilmaydi.
 */
export const markProvisioned = async (licenseKey: string, applied: boolean): Promise<void> => {
  try {
    const fingerprint = await getFingerprint();
    await fetch(`${SUPERVISOR_URL}/v1/provisioned`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // 🔴 `applied` — provisioning HAQIQATAN qo'llandimi. `false` bo'lsa
      // Supervisor vaqtinchalik parolni SAQLAYDI: u qo'llanmagan, ya'ni vendor
      // `prepare-reinstall` bilan tayyorlagan kredensial hali kerak.
      // Supervisor tomonda maydon ixtiyoriy va default `true` (orqaga moslik).
      body: JSON.stringify({ licenseKey, fingerprint, applied }),
    });
  } catch {
    // no-op — best-effort
  }
};

/**
 * CLI-226 — vendor-mediated owner password reset. Supervisor'ning
 * `/v1/verify-reset`i `{ ok: boolean }` qaytaradi (`LicenseData` shape EMAS —
 * `post()` helper mos emas, chunki u non-2xx'da throw qiladi va `ok:false`
 * javobi ATAYIN 400 status bilan qaytadi). `.lic` yo'q yoki fingerprint
 * hisoblanmasa (VM/konteyner) — `{ ok: false }` (network so'rovsiz).
 */
export const verifyReset = async (resetToken: string): Promise<{ ok: boolean }> => {
  const lic = await readLicense();
  if (!lic) return { ok: false };
  let fingerprint: string;
  try {
    fingerprint = await getFingerprint();
  } catch {
    return { ok: false };
  }
  try {
    const res = await fetch(`${SUPERVISOR_URL}/v1/verify-reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey: lic.licenseKey, fingerprint, resetToken }),
    });
    const json = (await res.json()) as { ok?: boolean };
    return { ok: json?.ok === true };
  } catch {
    return { ok: false };
  }
};
