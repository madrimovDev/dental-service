import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { verifyLicenseSignature } from '@dental/core/license-signature';
import { SUPERVISOR_PUBLIC_KEY_PEM } from '@dental/core/supervisor-public-key';
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

// Funksiya sifatida (top-level const EMAS) — chaqiruv-vaqtida hisoblanadi,
// storage.ts/config.ts/process-manager.ts konvensiyasiga mos. Top-level const
// bo'lganida modul birinchi marta import qilinganda (masalan boshqa test
// faylining `import * as realLicense from './license'` orqali, `mock.module`
// spread uchun) `process.env.LICENSE_PATH` "muzlab" qolar edi — keyinchalik
// biror test shu env varni o'zgartirsa ham, allaqachon eskirgan qiymat
// ishlatilardi (isbotlangan: license.test.ts'ning o'z tmpdir override'i
// e'tiborsiz qolib, haqiqiy dev LICENSE_PATH'ga yozib qo'yardi).
export const getLicensePath = (): string =>
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
  const licensePath = getLicensePath();
  await mkdir(dirname(licensePath), { recursive: true });
  await writeFile(licensePath, payload.toString('base64'));
};

export const readLicense = async (): Promise<LicenseData | null> => {
  try {
    const raw = await readFile(getLicensePath(), 'utf8');
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

export const isLicenseValid = (data: LicenseData): boolean => {
  const { signature, ...payload } = data;
  if (!verifyLicenseSignature(payload, signature, SUPERVISOR_PUBLIC_KEY_PEM)) {
    return false;
  }
  const expiry = new Date(data.expiresAt).getTime();
  const grace = data.gracePeriodDays * 86400000;
  return Date.now() < expiry + grace;
};

export const getActiveModules = async (): Promise<string[]> => {
  const lic = await readLicense();
  if (!lic || !isLicenseValid(lic)) return [];
  return lic.modules;
};

/**
 * `.lic` faylni o'chiradi (CLI-387 — heartbeat Supervisor'dan `INVALID_KEY`
 * (deaktivatsiya) qaytarganda chaqiriladi). `getActiveModules()` faylni HAR
 * chaqiruvda qayta o'qiydi (cache yo'q) — shuning uchun bu yetarli: keyingi
 * `requireModule` tekshiruvi darhol `LICENSE_NOT_FOUND` qaytaradi, hech
 * qanday qo'shimcha invalidation-signal yoki restart kerak emas.
 */
export const invalidateLicense = async (): Promise<void> => {
  try {
    await unlink(getLicensePath());
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
};
