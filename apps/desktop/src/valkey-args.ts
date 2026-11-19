/**
 * Valkey spawn argumentlari — sof modul (electron'siz, real-binary testi uchun).
 *
 * FX-96 (LB-05): desktop'da Valkey ilgari `appendonly no` + `save ""` bilan
 * ishlardi — kompyuter o'chishi / Windows yangilanishi / crash-restart'da
 * barcha kechiktirilgan eslatma job'lari yo'qolardi. Endi AOF yoqiladi va
 * `dir` aniq `dataDir\valkey` ga qo'yiladi (spawn cwd'i — Electron o'rnatish
 * papkasi, yozib bo'lmasligi mumkin). Argumentlar conf faylidan KEYIN keladi va
 * uni ustidan yozadi — first-run'da eski conf ko'chirilgan mavjud o'rnatmalar
 * ham conf'ni qayta ko'chirmasdan doimiylikka o'tadi.
 */
import { join } from 'node:path';

/** Valkey ma'lumot papkasi (AOF) — `dataDir` ichida. */
export const getValkeyDataDir = (dataDir: string): string => join(dataDir, 'valkey');

export const buildValkeyArgs = (confPath: string, dataDir: string): string[] => [
  confPath,
  '--dir',
  getValkeyDataDir(dataDir),
  '--appendonly',
  'yes',
  '--appendfsync',
  'everysec',
];
