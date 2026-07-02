import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import si from 'systeminformation';

export interface LicenseData {
  licenseKey: string;
  clinicId: string;
  modules: string[];
  expiresAt: string;
  gracePeriodDays: number;
  issuedAt: string;
  signature: string;
}

export const LICENSE_PATH =
  process.env.LICENSE_PATH ??
  (process.platform === 'win32'
    ? 'C:\\ProgramData\\DentalService\\license.lic'
    : '/var/lib/dental-service/license.lic');

export const getFingerprint = async (): Promise<string> => {
  const [cpu, system, nets] = await Promise.all([si.cpu(), si.system(), si.networkInterfaces()]);
  const primaryMac = (Array.isArray(nets) ? nets : [nets]).find((n) => n.default)?.mac ?? '';

  // VM yoki konteynerda bo'sh qaytsa — aniq xato (virtual muhit qo'llab-quvvatlanmaydi)
  if (!system.uuid && !system.serial && !primaryMac) {
    throw new Error('FINGERPRINT_UNAVAILABLE');
  }

  const raw = `${cpu.manufacturer}:${cpu.brand}:${system.uuid}:${system.serial}:${primaryMac}`;
  return createHash('sha256').update(raw).digest('hex');
};

const getKey = async () => {
  const fp = await getFingerprint();
  // fp — sha256 hex digest (64 hex char = 32 byte). To'liq 256 bit kalit uchun
  // hex sifatida parse qilinadi (oldingi `fp.slice(0,32)` — ASCII sifatida
  // faqat 128 bit haqiqiy entropiya berardi, chunki har bayt 0-9a-f oralig'ida).
  return Buffer.from(fp, 'hex');
};

export const writeLicense = async (data: LicenseData): Promise<void> => {
  const key = await getKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-cbc', key, iv);
  const json = JSON.stringify(data);
  const encrypted = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()]);
  const payload = Buffer.concat([iv, encrypted]);
  await mkdir(dirname(LICENSE_PATH), { recursive: true });
  await writeFile(LICENSE_PATH, payload.toString('base64'));
};

export const readLicense = async (): Promise<LicenseData | null> => {
  try {
    const raw = await readFile(LICENSE_PATH, 'utf8');
    const payload = Buffer.from(raw, 'base64');
    const iv = payload.subarray(0, 16);
    const encrypted = payload.subarray(16);
    const key = await getKey();
    const decipher = createDecipheriv('aes-256-cbc', key, iv);
    const json = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
    return JSON.parse(json) as LicenseData;
  } catch {
    return null;
  }
};

// TODO(security): signature verifikatsiya keyinga qoldirilgan —
// `packages/core/supervisor-public-key.ts` hali mavjud emas (birinchi prod
// deploy'da qo'shiladi). Hozircha faqat grace-period tekshiriladi; imzo
// tekshirilmagani sabab, mahalliy admin `getFingerprint()`ni o'zi chaqirib
// (u sir emas) kalitni hosil qilib, ixtiyoriy `modules`/`expiresAt` bilan
// `.lic` faylni qayta yozishi mumkin — module-gating hozircha shu yo'l bilan
// chetlab o'tiladi. Public key ulanganda bu yerga RSA signature verify
// qo'shilishi shart.
export const isLicenseValid = (data: LicenseData): boolean => {
  const expiry = new Date(data.expiresAt).getTime();
  const grace = data.gracePeriodDays * 86400000;
  return Date.now() < expiry + grace;
};

export const getActiveModules = async (): Promise<string[]> => {
  const lic = await readLicense();
  if (!lic || !isLicenseValid(lic)) return [];
  return lic.modules;
};
