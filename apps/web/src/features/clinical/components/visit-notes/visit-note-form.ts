/**
 * UI-D4 — vizit yozuvi sahifasining sof mantig'i (React'siz): so'rov tanasi,
 * dori ↔ allergiya tekshiruvi, avto-qoralama (localStorage, try/catch).
 */

import type { CreateVisitNoteInput } from '@dental/api-client';
import {
  type DrugAllergyConflict,
  findDrugAllergyConflicts,
  overrideCoversConflict,
  overrideKey,
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
  /** FX-14 (D-9): imzo bosqichni yopadimi (default true; false — oraliq vizit). */
  completesStage: boolean;
  appointmentId: string | null;
  nextVisit: NextVisit | null;
  /** FT-01.4: vizitda ishlangan tish(lar), FDI. */
  toothNumbers: number[];
};

export const emptyVisitForm = (): VisitFormValues => ({
  subjective: '',
  objective: '',
  assessmentDiagnoses: [],
  plan: '',
  freeNotes: '',
  performedServices: [],
  stageId: null,
  completesStage: true,
  appointmentId: null,
  nextVisit: null,
  toothNumbers: [],
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
  completesStage: v.stageId ? v.completesStage : undefined,
  allergyOverrides: ctx.overrides.length > 0 ? ctx.overrides : undefined,
  nextVisit: v.nextVisit ?? undefined,
  // Tahrirda bo'sh massiv ham yuboriladi (tishlarni tozalash), yaratishda bo'sh — yuborilmaydi.
  toothNumbers: ctx.isEdit || v.toothNumbers.length > 0 ? v.toothNumbers : undefined,
});

// ===== yozilishga bog'lash (FX-117) =====

export type LinkableAppointment = {
  id: string;
  doctorId: string;
  status: string;
  startTime: string;
};

/**
 * FX-117 (LB-26): yangi vizit yozuvi qaysi yozilishga bog'lanadi.
 *  - FAQAT shu shifokorning, bekor qilinmagan/kelmagan yozilishi;
 *  - `requestedId` («Mendan kutilmoqda» bandi `?appointmentId=`) mos kelsa — o'sha (o'tgan kun ham);
 *  - aks holda bugungi, hali yozuv bog'lanmagan yozilishlardan hozirga eng yaqini.
 */
export const pickAppointmentToLink = (opts: {
  appointments: LinkableAppointment[];
  doctorId: string;
  requestedId?: string | null;
  linkedAppointmentIds?: Array<string | null | undefined>;
  now?: Date;
}): string | null => {
  const now = opts.now ?? new Date();
  const own = opts.appointments.filter(
    (a) => a.doctorId === opts.doctorId && a.status !== 'cancelled' && a.status !== 'no_show',
  );
  if (opts.requestedId && own.some((a) => a.id === opts.requestedId)) return opts.requestedId;
  const linked = new Set(opts.linkedAppointmentIds ?? []);
  const today = now.toDateString();
  const candidates = own.filter(
    (a) => !linked.has(a.id) && new Date(a.startTime).toDateString() === today,
  );
  candidates.sort(
    (x, y) =>
      Math.abs(new Date(x.startTime).getTime() - now.getTime()) -
      Math.abs(new Date(y.startTime).getTime() - now.getTime()),
  );
  return candidates[0]?.id ?? null;
};

// ===== dori ↔ allergiya =====
export { overrideCoversConflict, overrideKey };

/** Shu dori uchun allergiya to'qnashuvi va u HALI sabab bilan tasdiqlanmagan bo'lsa. */
export const pendingAllergyConflict = (
  drug: string,
  allergies: readonly { substance: string }[] | null | undefined,
  overrides: readonly AllergyOverride[],
): DrugAllergyConflict | null => {
  if (!overrideKey(drug)) return null;
  return (
    findDrugAllergyConflicts(drug, allergies).find(
      (c) => !overrides.some((o) => overrideCoversConflict(o, drug, c)),
    ) ?? null
  );
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
