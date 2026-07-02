import { getFingerprint, type LicenseData } from './license';

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
