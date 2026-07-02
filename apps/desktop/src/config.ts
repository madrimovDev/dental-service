import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export type AppRole = 'server' | 'client';

export interface AppConfig {
  role: AppRole;
  serverUrl: string | null; // null = hali topilmagan, discovery qayta ishlaydi
  licenseKey: string | null;
  serverPort: number;
}

const DEFAULTS: AppConfig = {
  role: 'server',
  serverUrl: null,
  licenseKey: null,
  serverPort: 80,
};

// Runtime da har chaqiruvda hisoblanadi (env-override testable bo'lishi uchun) —
// modul import vaqtida bir marta "muzlatilgan" konstantaga tayanmaydi.
const getConfigDir = (): string =>
  process.env.DENTAL_CONFIG_DIR ||
  (process.platform === 'win32' ? 'C:\\ProgramData\\DentalService' : '/var/lib/dental-service');

export const getConfigPath = (): string => join(getConfigDir(), 'config.json');

// Interfeys mosligi uchun eksport qilingan konstanta — import vaqtidagi qiymatni
// aks ettiradi. Chaqiruv-vaqtida yo'lni qayta hisoblash kerak bo'lsa (masalan
// testlarda) `getConfigPath()` ishlatilsin.
export const CONFIG_PATH = getConfigPath();

export const readConfig = (): AppConfig => {
  try {
    const raw = readFileSync(getConfigPath(), 'utf8');
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
};

export const writeConfig = (partial: Partial<AppConfig>): void => {
  const current = readConfig();
  const updated = { ...current, ...partial };
  mkdirSync(getConfigDir(), { recursive: true });
  writeFileSync(getConfigPath(), JSON.stringify(updated, null, 2));
};
