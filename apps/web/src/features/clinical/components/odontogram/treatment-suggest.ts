import type { Diagnosis, Service } from '@dental/api-client';
import { normalizeSearch } from '../../clinical.mappers';

/**
 * Tish xaritasi «Davolash taklifi»: tashxisga mos xizmatlar. Katalogda tashxis↔xizmat bog'lanishi
 * yo'q, shuning uchun bu — taxminiy (o'zak mosligi + ICD-10 guruhi) ro'yxat; shifokor baribir
 * katalogdan o'zi tanlay oladi.
 */
type Stem = string;

export type ServiceLike = Pick<
  Service,
  'nameUz' | 'nameRu' | 'category' | 'descriptionUz' | 'isActive'
>;

/** ICD-10 guruhi → xizmat nomidagi o'zaklar (uz + ru). */
const CODE_STEMS: { prefix: string; stems: Stem[] }[] = [
  { prefix: 'K02', stems: ['plomb', 'restavr', 'kariy'] },
  { prefix: 'K03', stems: ['plomb', 'restavr'] },
  { prefix: 'K04', stems: ['kanal', 'ildiz', 'pulp', 'endodont', 'корнев', 'пульп'] },
  { prefix: 'K05', stems: ['parodont', 'gingiv', 'tozalash', 'пародонт', 'гингив'] },
  { prefix: 'K06', stems: ['parodont', 'gingiv', 'пародонт'] },
  { prefix: 'K07', stems: ['ortodont', 'breket', 'ортодонт'] },
  { prefix: 'K08', stems: ['protez', 'implant', 'olish', 'koronka', 'протез', 'имплант'] },
  { prefix: 'K00', stems: ['olish', 'удален'] },
  { prefix: 'K01', stems: ['olish', 'удален'] },
];

const tokens = (s: string): Stem[] =>
  normalizeSearch(s)
    .split(/[^a-zа-я0-9]+/u)
    .filter((w) => w.length >= 5)
    .map((w) => w.slice(0, 5));

export function suggestServices<S extends ServiceLike>(
  diagnosis: Pick<Diagnosis, 'code' | 'nameUz' | 'nameRu'> | null,
  services: readonly S[],
  lang: 'uz' | 'ru',
  limit = 4,
): S[] {
  if (!diagnosis) return [];
  const dxStems = new Set<Stem>([
    ...tokens(lang === 'ru' ? diagnosis.nameRu || diagnosis.nameUz : diagnosis.nameUz),
    ...tokens(diagnosis.nameUz),
  ]);
  const code = diagnosis.code.toUpperCase();
  const codeStems = CODE_STEMS.filter((c) => code.startsWith(c.prefix)).flatMap((c) => c.stems);

  const scored = services
    .filter((s) => s.isActive)
    .map((s) => {
      const text = normalizeSearch(
        `${s.nameUz} ${s.nameRu ?? ''} ${s.category ?? ''} ${s.descriptionUz ?? ''}`,
      );
      let score = 0;
      for (const st of dxStems) if (text.includes(st)) score += 1;
      // ICD-10 guruhi mosligi — kuchliroq signal.
      for (const st of codeStems) if (text.includes(normalizeSearch(st))) score += 2;
      return { s, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.s.nameUz.localeCompare(b.s.nameUz));
  return scored.slice(0, limit).map((x) => x.s);
}
