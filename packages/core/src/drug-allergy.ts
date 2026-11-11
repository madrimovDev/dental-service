/**
 * Dori ↔ allergiya tekshiruvi (UI-D4) — oddiy lug'at, sof funksiyalar.
 *
 * Bu klinik qaror emas, ogohlantirish: shifokor `CriticalActionDialog`da sabab
 * bilan davom etishi mumkin. Lug'at ataylab kichik — stomatologiyada ko'p
 * uchraydigan guruhlar. Moddalar lotin (uz), kirill (ru) va xalqaro yozuvda
 * bir xil shaklga keltirib solishtiriladi.
 */
import { cyrillicToLatin } from './translit.ts';

export type DrugAllergyGroup = {
  id: string;
  /** Allergiya yozuvi shu so'zlardan birini o'z ichiga olsa — guruhga allergiya. */
  keywords: string[];
};

const GROUP_DEFS: Array<{ id: string; terms: string[] }> = [
  {
    id: 'penicillin',
    terms: [
      'penitsillin',
      'penicillin',
      'amoksitsillin',
      'amoxicillin',
      'amoksiklav',
      'amoxiclav',
      'augmentin',
      'ampitsillin',
      'ampicillin',
      'flemoksin',
      'flemoxin',
      'oksatsillin',
      'oxacillin',
      'bitsillin',
      'bicillin',
      'fenoksimetilpenitsillin',
      'piperatsillin',
    ],
  },
  {
    id: 'cephalosporin',
    terms: [
      'sefaleksin',
      'cephalexin',
      'seftriakson',
      'ceftriaxone',
      'sefazolin',
      'cefazolin',
      'sefuroksim',
      'cefuroxime',
      'sefiksim',
      'cefixime',
      'sefalosporin',
      'cephalosporin',
    ],
  },
  {
    id: 'nsaid',
    terms: [
      'nsvs',
      'nsaid',
      'aspirin',
      'atsetilsalitsil',
      'acetylsalicyl',
      'ibuprofen',
      'diklofenak',
      'diclofenac',
      'ketorol',
      'ketorolac',
      'ketoprofen',
      'nimesulid',
      'nimesulide',
      'naproksen',
      'naproxen',
      'meloksikam',
      'meloxicam',
      'nurofen',
    ],
  },
  {
    id: 'sulfonamide',
    terms: ['sulfanilamid', 'sulfonamid', 'biseptol', 'kotrimoksazol', 'cotrimoxazole', 'sulfa'],
  },
  {
    id: 'macrolide',
    terms: [
      'makrolid',
      'macrolide',
      'azitromitsin',
      'azithromycin',
      'eritromitsin',
      'erythromycin',
      'klaritromitsin',
      'clarithromycin',
    ],
  },
  {
    id: 'amide_anesthetic',
    terms: [
      'lidokain',
      'lidocaine',
      'artikain',
      'articaine',
      'ultrakain',
      'ultracaine',
      'ubistezin',
      'septanest',
      'mepivakain',
      'mepivacaine',
      'skandonest',
      'bupivakain',
      'bupivacaine',
    ],
  },
  {
    id: 'lincosamide',
    terms: ['linkomitsin', 'lincomycin', 'klindamitsin', 'clindamycin', 'dalatsin'],
  },
];

const DOUBLE = /([a-z])\1+/g;

/**
 * Qidiruv uchun normalizatsiya: kichik harf, kirill → lotin, `c` → `ts`/`k`,
 * `x` → `ks`, `ph` → `f`, juft harflar bitta (penicillin ⇄ penitsilin).
 */
export const normalizeDrugName = (input: string): string => {
  let s = cyrillicToLatin(input.toLowerCase());
  s = s
    .replace(/['ʻʼ’‘`´ʹ]/g, '')
    .replace(/ph/g, 'f')
    .replace(/c(?=[iey])/g, 'ts')
    .replace(/c(?!h)/g, 'k')
    .replace(/x/g, 'ks')
    .replace(/w/g, 'v')
    .replace(DOUBLE, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  return s;
};

const GROUPS: Array<DrugAllergyGroup & { terms: string[] }> = GROUP_DEFS.map((g) => {
  const terms = g.terms.map(normalizeDrugName);
  return { id: g.id, keywords: terms, terms };
});

const MIN_DIRECT_LEN = 4;

export type DrugAllergyConflict = {
  /** Lug'at guruhi (`penicillin`…) yoki `direct` — nom to'g'ridan-to'g'ri mos. */
  group: string;
  /** Bemor kartasidagi allergiya yozuvi (asl yozilishi bilan). */
  allergen: string;
  /** Tekshirilgan dori nomi (asl yozilishi bilan). */
  drug: string;
};

type AllergyLike = { substance: string };

const includesAny = (haystack: string, needles: string[]): boolean =>
  needles.some((n) => n.length >= 3 && haystack.includes(n));

/**
 * `drug` shu allergiyalardan biriga zid kelsa har bir mos allergiya uchun bitta
 * konflikt qaytaradi. Bo'sh ro'yxat = muammo topilmadi (kafolat emas).
 */
export const findDrugAllergyConflicts = (
  drug: string,
  allergies: readonly AllergyLike[] | null | undefined,
): DrugAllergyConflict[] => {
  const drugNorm = normalizeDrugName(drug);
  if (drugNorm.length < MIN_DIRECT_LEN || !allergies?.length) return [];

  const out: DrugAllergyConflict[] = [];
  const seen = new Set<string>();
  for (const a of allergies) {
    const allergenNorm = normalizeDrugName(a.substance ?? '');
    if (allergenNorm.length < MIN_DIRECT_LEN) continue;

    let group: string | null = null;
    for (const g of GROUPS) {
      if (includesAny(allergenNorm, g.terms) && includesAny(drugNorm, g.terms)) {
        group = g.id;
        break;
      }
    }
    if (!group && (drugNorm.includes(allergenNorm) || allergenNorm.includes(drugNorm))) {
      group = 'direct';
    }
    if (!group) continue;

    const key = `${group}|${allergenNorm}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ group, allergen: a.substance, drug });
  }
  return out;
};
