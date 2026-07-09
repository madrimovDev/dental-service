import { getFingerprint, type LicenseData, readLicense } from './license';

// Compile-time constant (bun build --compile --define ishlatiladi)
// Foydalanuvchi o'zgartira olmaydi — xavfsizlik chegarasi
export const SUPERVISOR_URL = process.env.SUPERVISOR_URL ?? 'https://supervisor.dental.uz';

const post = async (path: string, body: object): Promise<LicenseData> => {
  const res = await fetch(`${SUPERVISOR_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { error?: { code?: string } } & Partial<LicenseData>;
  if (!res.ok) {
    throw new Error(json?.error?.code ?? 'SUPERVISOR_ERROR');
  }
  return json as LicenseData;
};

export const activateLicense = async (licenseKey: string): Promise<LicenseData> => {
  const fingerprint = await getFingerprint();
  return post('/v1/activate', { licenseKey, fingerprint });
};

export const sendHeartbeat = async (licenseKey: string): Promise<LicenseData> => {
  const fingerprint = await getFingerprint();
  return post('/v1/heartbeat', { licenseKey, fingerprint });
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
