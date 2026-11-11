import { cyrillicToLatin } from '@dental/core';

/**
 * UI-D3 — tashxis qidiruvi: nom (uz/ru) + sinonim + kod, xatoga chidamli.
 *
 * `pg_trgm` ishlatilmaydi (desktop Postgres'da contrib bo'lmasligi mumkin, migratsiya
 * yo'q): katalog kichik (platform-level, bir necha yuz qator), shuning uchun
 * mosliklash va tartiblash xotirada — sof funksiyalar, DB'siz test qilinadi.
 *
 * Moslik: har bir so'rov so'zi (token) tashxisning biror so'zi bilan
 *  - aniq/prefiks mos kelishi (normalizatsiyadan keyin), yoki
 *  - 1–2 harflik xato (Damerau–Levenshtein; so'z uzunligiga qarab) bilan mos kelishi kerak.
 */

/** Sinonimlar: ICD-10 kategoriya (yoki kod prefiksi) → klinikada aytiladigan muqobil nomlar. */
export const DIAGNOSIS_SYNONYMS: Record<string, string[]> = {
  K00: ['tish rivojlanishi', 'tish yorib chiqishi', 'развитие зубов', 'прорезывание'],
  K01: ['yashirin tish', 'chiqmagan tish', 'akl tishi', 'ретинированный зуб', 'зуб мудрости'],
  K02: ['chirish', 'tish chirishi', 'kariyes', 'karies', 'кариес', 'гниение зуба'],
  K03: ['tish yeyilishi', 'tish eroziyasi', 'стирание зуба'],
  K04: ['pulpit', 'tish nervi', 'nerv', 'tish og‘rig‘i', 'пульпит', 'нерв зуба', 'периодонтит'],
  K05: ['milk yallig‘lanishi', 'gingivit', 'parodontit', 'milk qonashi', 'десна', 'гингивит'],
  K06: ['milk', 'milk chekinishi', 'десна', 'рецессия'],
  K07: ['tish qatori', 'noto‘g‘ri tishlam', 'прикус', 'ортодонтия'],
  K08: ['tish yo‘qotish', 'tishsizlik', 'tish olish', 'потеря зуба', 'удаление'],
  K09: ['kista', 'киста'],
  K12: ['stomatit', 'og‘iz yarasi', 'афта', 'стоматит'],
  K13: ['lab', 'og‘iz shilliq', 'слизистая'],
  K14: ['til', 'glossit', 'язык'],
};

/** Harf xatolariga chidamli kalit: kichik harf, kirill→lotin, imlo variantlarini birlashtirish. */
export const normalizeDxText = (input: string): string => {
  let s = input.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
  s = cyrillicToLatin(s, { xAs: 'h' });
  s = s
    .replace(/[ʻʼ’‘`´ʹ'‘’]/g, '') // apostroflar (o', g', tish og'rig'i)
    .replace(/x/g, 'h')
    .replace(/q/g, 'k')
    .replace(/w/g, 'v')
    .replace(/(?<=[aeiou])y|y(?=[aeiou])/g, '') // kariyes → karies, kariyse → karise
    .replace(/(.)\1+/g, '$1'); // qo'sh harflar: kk → k
  return s;
};

const tokens = (input: string): string[] =>
  normalizeDxText(input)
    .split(/[^a-z0-9.]+/)
    .filter((t) => t.length > 0);

/** Damerau–Levenshtein (adjacent transposition bilan), `max`dan oshsa `max+1`. */
export const editDistance = (a: string, b: string, max: number): number => {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const cols = b.length + 1;
  const d = new Int32Array((a.length + 1) * cols);
  const at = (i: number, j: number): number => d[i * cols + j] ?? 0;
  for (let i = 0; i <= a.length; i++) d[i * cols] = i;
  for (let j = 0; j <= b.length; j++) d[j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(at(i - 1, j) + 1, at(i, j - 1) + 1, at(i - 1, j - 1) + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, at(i - 2, j - 2) + 1);
      }
      d[i * cols + j] = v;
    }
  }
  return at(a.length, b.length);
};

/** So'z uzunligiga qarab ruxsat etilgan xato soni (qisqa so'zda — 0). */
const allowedTypos = (len: number): number => (len >= 8 ? 2 : len >= 4 ? 1 : 0);

/** Bitta so'rov so'zining tashxis so'zlariga mosligi: 0 = aniq, 1 = prefiks, 2+ = xato bilan; null = mos emas. */
const tokenCost = (q: string, haystack: string[]): number | null => {
  let best: number | null = null;
  const consider = (cost: number) => {
    if (best === null || cost < best) best = cost;
  };
  // Kod-ko'rinishidagi so'z («k02.1») — harf xatosiga yo'l qo'yilmaydi (K00.1 ≠ K02.1).
  const typos = /\d/.test(q) ? 0 : allowedTypos(q.length);
  for (const h of haystack) {
    if (h === q) return 0;
    if (h.startsWith(q)) consider(1);
    else if (q.length >= 2 && h.includes(q) && q.length >= 4) consider(2);
    if (typos > 0) {
      const whole = editDistance(q, h, typos);
      if (whole <= typos) consider(2 + whole);
      // uzun so'rov: prefiks + xato («kariyesi» yozilganda «kariyes…» boshi bilan)
      if (q.length >= 8 && h.length > q.length) {
        const pre = editDistance(q, h.slice(0, q.length), typos);
        if (pre <= typos) consider(3 + pre);
      }
    }
  }
  return best;
};

export type DiagnosisSearchRow = {
  code: string;
  category: string | null;
  nameUz: string;
  nameRu: string;
  descriptionUz?: string | null;
  descriptionRu?: string | null;
};

export const synonymsFor = (row: Pick<DiagnosisSearchRow, 'code' | 'category'>): string[] => {
  const prefix = row.code.split('.')[0] ?? '';
  return [...(DIAGNOSIS_SYNONYMS[row.category ?? ''] ?? []), ...(DIAGNOSIS_SYNONYMS[prefix] ?? [])];
};

/** `null` — mos emas; aks holda kichikroq = yaxshiroq. Nom moslashuvi sinonim/kod'dan ustun. */
export const scoreDiagnosis = (row: DiagnosisSearchRow, query: string): number | null => {
  const qTokens = tokens(query);
  if (qTokens.length === 0) return null;

  const nameTokens = [...tokens(row.nameUz), ...tokens(row.nameRu)];
  const codeTokens = [...tokens(row.code), ...tokens(row.category ?? '')];
  const synTokens = synonymsFor(row).flatMap(tokens);
  const all = [...nameTokens, ...codeTokens, ...synTokens];

  let total = 0;
  for (const q of qTokens) {
    const inName = tokenCost(q, nameTokens);
    const inCode = tokenCost(q, codeTokens);
    const inSyn = tokenCost(q, synTokens);
    const costs = [
      inName,
      inCode === null ? null : inCode + 0.5,
      inSyn === null ? null : inSyn + 1,
    ].filter((c): c is number => c !== null);
    if (costs.length === 0 || tokenCost(q, all) === null) return null;
    total += Math.min(...costs);
  }
  return total;
};

/** Mos tashxislarni tartiblab (relevantlik, keyin kod) qaytaradi, `limit` bilan cheklangan. */
export const rankDiagnoses = <T extends DiagnosisSearchRow>(
  rows: T[],
  query: string,
  limit: number,
): T[] =>
  rows
    .map((row) => ({ row, score: scoreDiagnosis(row, query) }))
    .filter((x): x is { row: T; score: number } => x.score !== null)
    .sort((a, b) => a.score - b.score || a.row.code.localeCompare(b.row.code))
    .slice(0, limit)
    .map((x) => x.row);
