/**
 * FX-22 (LA-34) — dori↔allergiya qo'riqchisining umumiy sof mantig'i (React'siz):
 * VisitNotePage va PrescriptionsTab bir xil qoidani ishlatadi.
 */
import { ApiError } from '@dental/api-client';
import type { DrugAllergyConflict } from '@dental/core';
import type { AllergyOverride } from './clinical.types';
import { overrideKey, pendingAllergyConflict } from './components/visit-notes/visit-note-form';

export type AllergyQueryLike = { isLoading?: boolean; isError?: boolean } | undefined;

/** Allergiya ma'lumoti noma'lum: yuklanmoqda yoki xato/403 — jimgina «allergiya yo'q» deb o'tilmaydi. */
export const isAllergyUnknown = (q: AllergyQueryLike): boolean =>
  !!q && (!!q.isLoading || !!q.isError);

/** Noma'lum allergiyada sabab bilan tasdiqlash: har dori uchun audit izi (metadata.allergyOverrides). */
export const unknownAllergyOverrides = (
  drugs: readonly string[],
  reason: string,
): AllergyOverride[] => drugs.map((drug) => ({ drug, group: 'unknown', allergen: '—', reason }));

/** Hali sabab bilan tasdiqlanmagan birinchi to'qnashuv (dorilar ro'yxati bo'yicha). */
export const firstUnresolvedDrugConflict = (
  drugs: readonly string[],
  allergies: readonly { substance: string }[] | null | undefined,
  overrides: readonly AllergyOverride[],
): { index: number; conflict: DrugAllergyConflict } | null => {
  for (let i = 0; i < drugs.length; i++) {
    const conflict = pendingAllergyConflict(drugs[i] ?? '', allergies, overrides);
    if (conflict) return { index: i, conflict };
  }
  return null;
};

/** Shu dorilarga tegishli override'lar (serverga yuboriladi; cheklov 50). */
export const overridesForDrugs = (
  drugs: readonly string[],
  overrides: readonly AllergyOverride[],
): AllergyOverride[] => {
  const keys = new Set(drugs.map(overrideKey).filter(Boolean));
  return overrides
    .filter((o) => o.group !== 'unknown' && keys.has(overrideKey(o.drug)))
    .slice(0, 50);
};

export const ALLERGY_CONFLICT_CODE = 'prescription.allergy_conflict';

/** Server 409 `prescription.allergy_conflict` → birinchi to'qnashuv (`details[0]`), aks holda null. */
export const serverAllergyConflict = (e: unknown): DrugAllergyConflict | null => {
  if (!(e instanceof ApiError) || e.status !== 409 || e.code !== ALLERGY_CONFLICT_CODE) return null;
  const first = Array.isArray(e.details) ? (e.details[0] as Partial<DrugAllergyConflict>) : null;
  if (!first?.drug || !first.group || !first.allergen) return null;
  return { drug: first.drug, group: first.group, allergen: first.allergen };
};
