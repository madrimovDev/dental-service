/**
 * FU-24 — bemorlarni Excel/CSV'dan import qilish: SOF yordamchilar (DOM/xlsx yo'q, test qilinadi).
 * Fayl brauzerda o'qiladi (`readSpreadsheet`), ustunlar moslanadi (`guessMapping`), qatorlar
 * serverga yuboriladigan shaklga keltiriladi (`mapRows`). Yakuniy tekshiruv serverda (qator-qator).
 */

export const IMPORT_FIELDS = [
  'fullName',
  'phone',
  'phoneSecondary',
  'dateOfBirth',
  'gender',
  'address',
  'passport',
  'notes',
  'source',
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];

/** Majburiy maydon — ustun moslanmasa import boshlanmaydi. */
export const REQUIRED_IMPORT_FIELDS: readonly ImportField[] = ['fullName'];

export type ImportMapping = Record<ImportField, number | null>;

/** Serverga yuboriladigan qator (`POST /patients/import`). */
export type ImportRowInput = Partial<Record<ImportField, string>> & { fullName: string };

/** Server limiti — bitta so'rovda shuncha qator (`PATIENT_IMPORT_MAX_ROWS`). */
export const IMPORT_CHUNK_SIZE = 1000;
/** Brauzer xotirasini himoyalash — shundan katta fayl o'qilmaydi. */
export const IMPORT_MAX_FILE_BYTES = 5 * 1024 * 1024;
/** Bir faylda ko'pi bilan shuncha qator (xotira/UI himoyasi). */
export const IMPORT_MAX_ROWS = 20_000;

// Sarlavha sinonimlari (lotin/kirill/ingliz) — kichik harf, bo'shliq/belgisiz solishtiriladi.
const ALIASES: Record<ImportField, string[]> = {
  fullName: [
    'fio',
    'fish',
    'ism',
    'ismfamiliya',
    'ismfamilya',
    'bemor',
    'fullname',
    'name',
    'фио',
    'имя',
    'пациент',
    'фамилияимя',
    'исм',
    'бемор',
  ],
  phone: [
    'telefon',
    'tel',
    'raqam',
    'telefonraqam',
    'phone',
    'mobile',
    'телефон',
    'тел',
    'номер',
    'телефоннамер',
  ],
  phoneSecondary: [
    'telefon2',
    'qoshimchatelefon',
    'phone2',
    'qoshimchaaloqa',
    'телефон2',
    'доптелефон',
    'дополнительныйтелефон',
  ],
  dateOfBirth: [
    'tugilgansana',
    'tugilgan',
    'tugilganyil',
    'tugsana',
    'dob',
    'birthdate',
    'dateofbirth',
    'birthday',
    'датарождения',
    'рождения',
    'др',
    'тугилгансана',
  ],
  gender: ['jins', 'gender', 'sex', 'пол', 'жинс'],
  address: ['manzil', 'address', 'adres', 'адрес', 'манзил'],
  passport: ['pasport', 'passport', 'паспорт'],
  notes: ['izoh', 'eslatma', 'notes', 'note', 'comment', 'примечание', 'комментарий', 'изох'],
  source: ['manba', 'source', 'qayerdan', 'источник', 'манба'],
};

const squash = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[ʻʼ`´’']/g, '')
    .replace(/[^a-zа-яё0-9]/g, '');

/** Birinchi qator (sarlavha) bo'yicha ustun → maydon moslashi; topilmagani `null`. */
export function guessMapping(headers: string[]): ImportMapping {
  const mapping = Object.fromEntries(IMPORT_FIELDS.map((f) => [f, null])) as ImportMapping;
  const used = new Set<number>();
  const normalized = headers.map(squash);
  for (const field of IMPORT_FIELDS) {
    const idx = normalized.findIndex(
      (h, i) => !used.has(i) && h !== '' && ALIASES[field].includes(h),
    );
    if (idx >= 0) {
      mapping[field] = idx;
      used.add(idx);
    }
  }
  return mapping;
}

export function isMappingComplete(mapping: ImportMapping): boolean {
  return REQUIRED_IMPORT_FIELDS.every((f) => mapping[f] != null);
}

const pad = (n: number): string => String(n).padStart(2, '0');

const validIso = (y: number, m: number, d: number): string | null => {
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
};

/**
 * Tug'ilgan sana → `YYYY-MM-DD` (tanilmasa asl matn qaytadi — server `invalid_date` deydi).
 * Qabul: `YYYY-MM-DD`, `DD.MM.YYYY`, `DD/MM/YYYY`, `DD-MM-YYYY`, Excel seriya raqami.
 */
export function normalizeDate(raw: string): string {
  const v = raw.trim();
  if (!v) return '';
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(v);
  if (m) return validIso(Number(m[1]), Number(m[2]), Number(m[3])) ?? v;
  m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(v);
  if (m) return validIso(Number(m[3]), Number(m[2]), Number(m[1])) ?? v;
  if (/^\d{4,6}$/.test(v)) {
    // Excel seriya raqami (1900 sanalar tizimi; 25569 = 1970-01-01).
    const serial = Number(v);
    if (serial > 1 && serial < 80000) {
      const dt = new Date(Date.UTC(1970, 0, 1) + (serial - 25569) * 86_400_000);
      return validIso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()) ?? v;
    }
  }
  return v;
}

const MALE = new Set(['male', 'm', 'erkak', 'er', 'o‘g‘il', 'м', 'муж', 'мужской', 'эркак']);
const FEMALE = new Set(['female', 'f', 'ayol', 'qiz', 'ж', 'жен', 'женский', 'аёл', 'аел']);

/** Jins → `male|female|other`; bo'sh → ''. Tanilmagan matn `other` EMAS — server xato deb ko'rsatadi. */
export function normalizeGender(raw: string): string {
  const v = raw.trim().toLowerCase();
  if (!v) return '';
  if (MALE.has(v)) return 'male';
  if (FEMALE.has(v)) return 'female';
  if (v === 'other' || v === 'boshqa' || v === 'другой') return 'other';
  return v;
}

/**
 * Jadval qatorlarini (sarlavhasiz) server shakliga keltiradi. Butunlay bo'sh qatorlar tashlanadi;
 * qaytgan `sourceRow` — fayldagi asl qator raqami (sarlavha = 1) xato xabarlari uchun.
 */
export function mapRows(
  dataRows: string[][],
  mapping: ImportMapping,
): { rows: ImportRowInput[]; sourceRows: number[] } {
  const rows: ImportRowInput[] = [];
  const sourceRows: number[] = [];
  dataRows.forEach((cells, i) => {
    if (cells.every((c) => (c ?? '').trim() === '')) return;
    const get = (f: ImportField): string => {
      const idx = mapping[f];
      return idx == null ? '' : (cells[idx] ?? '').trim();
    };
    const row: ImportRowInput = { fullName: get('fullName') };
    for (const f of IMPORT_FIELDS) {
      if (f === 'fullName') continue;
      let v = get(f);
      if (f === 'dateOfBirth') v = normalizeDate(v);
      if (f === 'gender') v = normalizeGender(v);
      if (v) row[f] = v;
    }
    rows.push(row);
    sourceRows.push(i + 2); // +1 sarlavha, +1 1-asosli
  });
  return { rows, sourceRows };
}

/** Xom katak → matn (Date → `YYYY-MM-DD`, son → matn). */
export function cellToString(cell: unknown): string {
  if (cell == null) return '';
  if (cell instanceof Date) {
    if (Number.isNaN(cell.getTime())) return '';
    // SheetJS sanani mahalliy vaqtga moslab beradi; +12 soat — soat-yaqinlashuvi siljishidan himoya.
    const d = new Date(cell.getTime() + 12 * 3_600_000);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  return String(cell).trim();
}

export class ImportFileError extends Error {
  constructor(readonly code: 'too_big' | 'empty' | 'unreadable' | 'too_many_rows') {
    super(code);
    this.name = 'ImportFileError';
  }
}

/**
 * `.xlsx/.xls/.csv` → `string[][]` (birinchi varaq). SheetJS faqat kerak bo'lganda yuklanadi
 * (bundle bo'linishi). Formulalar HISOBLANMAYDI/bajarilmaydi — faqat saqlangan qiymat o'qiladi.
 */
export async function readSpreadsheet(file: File): Promise<string[][]> {
  if (file.size > IMPORT_MAX_FILE_BYTES) throw new ImportFileError('too_big');
  const XLSX = await import('xlsx');
  let table: unknown[][];
  try {
    const opts = { cellDates: true, cellFormula: false, cellHTML: false } as const;
    // CSV matn sifatida o'qiladi (UTF-8 — kirill/lotin diakritika codepage'ga tushmasin).
    const wb = /\.csv$/i.test(file.name)
      ? XLSX.read(await file.text(), { ...opts, type: 'string' })
      : XLSX.read(await file.arrayBuffer(), { ...opts, type: 'array' });
    const sheetName = wb.SheetNames[0];
    const sheet = sheetName ? wb.Sheets[sheetName] : undefined;
    if (!sheet) throw new ImportFileError('empty');
    table = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: true,
      defval: '',
      blankrows: false,
    });
  } catch (e) {
    if (e instanceof ImportFileError) throw e;
    throw new ImportFileError('unreadable');
  }
  const cells = table.map((r) => r.map(cellToString));
  if (cells.length < 2) throw new ImportFileError('empty');
  if (cells.length - 1 > IMPORT_MAX_ROWS) throw new ImportFileError('too_many_rows');
  return cells;
}

export const chunk = <T>(items: T[], size = IMPORT_CHUNK_SIZE): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

export type ImportResultRow = {
  row: number;
  status: 'created' | 'skipped_duplicate' | 'error';
  code?: string;
};
export type ImportResult = {
  dryRun: boolean;
  created: number;
  skippedDuplicate: number;
  errorCount: number;
  results: ImportResultRow[];
};

/** Bo'laklab yuborilgan natijalarni birlashtiradi; `row` global (fayl bo'yicha 1-asosli) qilinadi. */
export function mergeImportResults(
  parts: ImportResult[],
  chunkSize = IMPORT_CHUNK_SIZE,
): ImportResult {
  const merged: ImportResult = {
    dryRun: parts[0]?.dryRun ?? false,
    created: 0,
    skippedDuplicate: 0,
    errorCount: 0,
    results: [],
  };
  parts.forEach((p, i) => {
    merged.created += p.created;
    merged.skippedDuplicate += p.skippedDuplicate;
    merged.errorCount += p.errorCount;
    for (const r of p.results) merged.results.push({ ...r, row: r.row + i * chunkSize });
  });
  return merged;
}
