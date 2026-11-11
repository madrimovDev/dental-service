/**
 * Lotin ↔ kirill transliteratsiya — faqat QIDIRUV uchun (bemor ismi).
 *
 * Maqsad: registrator «турсун» yozsa «Tursun» topilsin, va aksincha. Bu
 * to'liq imlo konvertori emas: noaniq harflar (х/ҳ, e/э) uchun `searchVariants`
 * ikkala variantni qaytaradi, tanlashni DB `ILIKE` qiladi.
 *
 * Sof funksiyalar, I/O yo'q. Katta-kichik harf: digraf bosh harfi katta bo'lsa
 * natija ham «Sh» / «Ш» shaklida (qidiruv `ILIKE` bo'lgani uchun muhim emas,
 * lekin ko'rinish tabiiy qoladi).
 */

// ─── kirill → lotin ──────────────────────────────────────────────────────────

const CYR_TO_LAT: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'yo',
  ж: 'j',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'x',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'sch',
  ъ: "'",
  ы: 'i',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
  ў: "o'",
  ғ: "g'",
  қ: 'q',
  ҳ: 'h',
};

const capitalize = (s: string): string => (s ? s[0]?.toUpperCase() + s.slice(1) : s);

const isUpper = (ch: string): boolean => ch !== ch.toLowerCase();

/** Kirill → lotin. `xAs: 'h'` — «х» ni «x» o'rniga «h» deb o'giradi (Hamid ⇄ Хамид). */
export const cyrillicToLatin = (input: string, opts?: { xAs?: 'x' | 'h' }): string => {
  let out = '';
  for (const ch of input) {
    const lower = ch.toLowerCase();
    let mapped = CYR_TO_LAT[lower];
    if (mapped === undefined) {
      out += ch;
      continue;
    }
    if (lower === 'х' && opts?.xAs === 'h') mapped = 'h';
    out += isUpper(ch) ? capitalize(mapped) : mapped;
  }
  return out;
};

// ─── lotin → kirill ──────────────────────────────────────────────────────────

/** Apostrof variantlari (turli klaviatura/Unicode) → oddiy «'». */
const APOSTROPHES = /[ʻʼ’‘`´ʹ]/g;

// Uzunroq (digraf) kalitlar avval tekshiriladi.
const LAT_DIGRAPHS: Record<string, string> = {
  "o'": 'ў',
  "g'": 'ғ',
  sh: 'ш',
  ch: 'ч',
  yo: 'ё',
  yu: 'ю',
  ya: 'я',
  ye: 'е',
};

const LAT_SINGLE: Record<string, string> = {
  a: 'а',
  b: 'б',
  c: 'ц',
  d: 'д',
  e: 'е',
  f: 'ф',
  g: 'г',
  h: 'х',
  i: 'и',
  j: 'ж',
  k: 'к',
  l: 'л',
  m: 'м',
  n: 'н',
  o: 'о',
  p: 'п',
  q: 'қ',
  r: 'р',
  s: 'с',
  t: 'т',
  u: 'у',
  v: 'в',
  w: 'в',
  x: 'х',
  y: 'й',
  z: 'з',
  "'": 'ъ',
};

const upperFirst = (s: string): string => s.toUpperCase();

/** Lotin → kirill. `hAs: 'ҳ'` — «h» ni «х» o'rniga «ҳ» deb o'giradi. */
export const latinToCyrillic = (input: string, opts?: { hAs?: 'х' | 'ҳ' }): string => {
  const src = input.replace(APOSTROPHES, "'");
  let out = '';
  let i = 0;
  while (i < src.length) {
    const two = src.slice(i, i + 2);
    const digraph = LAT_DIGRAPHS[two.toLowerCase()];
    if (digraph) {
      // «o'»/«g'» da faqat birinchi harf bosh bo'lishi mumkin; «sh» da ham.
      out += isUpper(two[0] ?? '') ? upperFirst(digraph) : digraph;
      i += 2;
      continue;
    }
    const ch = src[i] ?? '';
    const lower = ch.toLowerCase();
    let single = LAT_SINGLE[lower];
    if (single === undefined) {
      out += ch;
      i += 1;
      continue;
    }
    if (lower === 'h' && opts?.hAs === 'ҳ') single = 'ҳ';
    out += isUpper(ch) ? upperFirst(single) : single;
    i += 1;
  }
  return out;
};

// ─── qidiruv variantlari ─────────────────────────────────────────────────────

const HAS_CYRILLIC = /\p{Script=Cyrillic}/u;
const HAS_LATIN = /\p{Script=Latin}/u;

/**
 * Qidiruv matnining variantlari (tartib: asl, asosiy o'girish, muqobil).
 * Faqat bir yozuv tizimida bo'lgan matn o'giriladi; raqam/belgi — bitta variant.
 * Takrorlar olib tashlanadi; bo'sh kiritma → `[]`.
 */
export const searchVariants = (search: string): string[] => {
  const term = search.trim();
  if (!term) return [];

  const variants = [term];
  if (HAS_CYRILLIC.test(term) && !HAS_LATIN.test(term)) {
    variants.push(cyrillicToLatin(term), cyrillicToLatin(term, { xAs: 'h' }));
  } else if (HAS_LATIN.test(term) && !HAS_CYRILLIC.test(term)) {
    variants.push(latinToCyrillic(term), latinToCyrillic(term, { hAs: 'ҳ' }));
  }
  return [...new Set(variants)];
};
