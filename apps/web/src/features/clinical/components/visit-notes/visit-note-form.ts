/**
 * UI-D4 — vizit yozuvi sahifasining sof mantig'i (React'siz): so'rov tanasi,
 * dori ↔ allergiya tekshiruvi, avto-qoralama (localStorage, try/catch).
 */

import type { CreateVisitNoteInput } from '@dental/api-client';
import {
  type DrugAllergyConflict,
  findDrugAllergyConflicts,
  normalizeDrugName,
} from '@dental/core';
import type { AllergyOverride, NextVisit } from '../../clinical.types';

export type RxRow = {
  key: string;
  drug: string;
  dosage: string;
  frequency: string;
  days: number | '';
};

export type VisitFormValues = {
  subjective: string;
  objective: string;
  assessmentDiagnoses: string[];
  plan: string;
  freeNotes: string;
  performedServices: string[];
  stageId: string | null;
  appointmentId: string | null;
  nextVisit: NextVisit | null;
};

export const emptyVisitForm = (): VisitFormValues => ({
  subjective: '',
  objective: '',
  assessmentDiagnoses: [],
  plan: '',
  freeNotes: '',
  performedServices: [],
  stageId: null,
  appointmentId: null,
  nextVisit: null,
});

export type VisitNoteBody = CreateVisitNoteInput & {
  allergyOverrides?: AllergyOverride[];
  nextVisit?: NextVisit;
};

/**
 * Saqlash tanasi. CLI-414/447 semantikasi saqlangan: yaratishda bo'sh xizmatlar
 * `undefined` (stock'ga tegilmaydi); tahrirda bo'sh massiv ham YUBORILADI (eski
 * xizmatlar BOM'i qaytarilishi uchun). P12: tahrirda faqat o'zgartirilgan emas, butun
 * forma yuboriladi — lekin server tomoni PATCH'da berilmagan maydonga tegmaydi.
 */
export const buildVisitNoteBody = (
  v: VisitFormValues,
  ctx: { patientId: string; doctorId: string; isEdit: boolean; overrides: AllergyOverride[] },
): VisitNoteBody => ({
  patientId: ctx.patientId,
  doctorId: ctx.doctorId,
  subjective: v.subjective || undefined,
  objective: v.objective || undefined,
  assessmentDiagnoses: v.assessmentDiagnoses,
  plan: v.plan || undefined,
  freeNotes: v.freeNotes || undefined,
  appointmentId: v.appointmentId ?? undefined,
  performedServices: ctx.isEdit || v.performedServices.length > 0 ? v.performedServices : undefined,
  stageId: v.stageId ?? undefined,
  allergyOverrides: ctx.overrides.length > 0 ? ctx.overrides : undefined,
  nextVisit: v.nextVisit ?? undefined,
});

// ===== dori ↔ allergiya =====
/** Dori asosiy nomi (dozasiz): «Amoksitsillin 500 mg» ≡ «амоксициллин». */
export const overrideKey = (drug: string): string => normalizeDrugName(drug).split(' ')[0] ?? '';

/** Shu dori uchun allergiya to'qnashuvi va u HALI sabab bilan tasdiqlanmagan bo'lsa. */
export const pendingAllergyConflict = (
  drug: string,
  allergies: readonly { substance: string }[] | null | undefined,
  overrides: readonly AllergyOverride[],
): DrugAllergyConflict | null => {
  const key = overrideKey(drug);
  if (!key) return null;
  if (overrides.some((o) => overrideKey(o.drug) === key)) return null;
  return findDrugAllergyConflicts(drug, allergies)[0] ?? null;
};

/** Qatorlar orasida hali hal qilinmagan birinchi to'qnashuv (saqlash oldidan qo'riqchi). */
export const firstUnresolvedRxConflict = (
  rows: readonly RxRow[],
  allergies: readonly { substance: string }[] | null | undefined,
  overrides: readonly AllergyOverride[],
): { index: number; conflict: DrugAllergyConflict } | null => {
  for (let i = 0; i < rows.length; i++) {
    const conflict = pendingAllergyConflict(rows[i]?.drug ?? '', allergies, overrides);
    if (conflict) return { index: i, conflict };
  }
  return null;
};

export const isRxRowComplete = (r: RxRow): boolean =>
  r.drug.trim() !== '' && r.dosage.trim() !== '' && r.frequency.trim() !== '';

// ===== avto-qoralama =====
export type VisitDraft = {
  values: VisitFormValues;
  rx: RxRow[];
  overrides: AllergyOverride[];
  savedAt: string;
};

export const draftKey = (patientId: string, noteId: string | null): string =>
  `visit-note-draft:${patientId}:${noteId ?? 'new'}`;

export const saveDraft = (key: string, draft: VisitDraft): boolean => {
  try {
    localStorage.setItem(key, JSON.stringify(draft));
    return true;
  } catch {
    return false; // private mode / quota — qoralama ixtiyoriy
  }
};

export const loadDraft = (key: string): VisitDraft | null => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<VisitDraft>;
    if (!parsed || typeof parsed !== 'object' || !parsed.values || !parsed.savedAt) return null;
    return {
      values: { ...emptyVisitForm(), ...parsed.values },
      rx: Array.isArray(parsed.rx) ? parsed.rx : [],
      overrides: Array.isArray(parsed.overrides) ? parsed.overrides : [],
      savedAt: parsed.savedAt,
    };
  } catch {
    return null;
  }
};

export const clearDraft = (key: string): void => {
  try {
    localStorage.removeItem(key);
  } catch {
    /* e'tiborsiz */
  }
};
