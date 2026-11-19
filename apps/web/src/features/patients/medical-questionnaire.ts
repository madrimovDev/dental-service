import type { AllergyEntry } from '@dental/api-client';

/** Bot anketasi savol kalitlari (apps/api `QUESTIONNAIRE_KEYS` bilan bir xil tartib). */
export const QUESTIONNAIRE_KEYS = [
  'allergies',
  'chronic',
  'medications',
  'pregnancy',
  'anesthesia',
] as const;
export type QuestionnaireKey = (typeof QUESTIONNAIRE_KEYS)[number];

/** «yo'q» / «нет» / «-» kabi inkor javoblar — tibbiy kartaga ko'chirilmaydi. */
const NEGATIVE = /^\s*(yo[‘'’`ʻ]?q|yoq|нет|нету|no|none|-+|—)\s*[.!]?\s*$/i;
export const isNegativeAnswer = (v: string): boolean => v.trim() === '' || NEGATIVE.test(v);

export type MedicalFormSnapshot = {
  anamnez: string;
  chronicConditionsText: string;
  currentMedicationsText: string;
  allergies: AllergyEntry[];
};

const appendCsv = (current: string, add: string): string =>
  current.trim() ? `${current.trim()}, ${add.trim()}` : add.trim();

const appendLine = (current: string, line: string): string =>
  current.trim() ? `${current.trim()}\n${line}` : line;

/**
 * Anketa javoblarini tibbiy karta FORMASIGA ko'chiradi (saqlamaydi — shifokor
 * ko'rib chiqib «Saqlash»ni o'zi bosadi). Inkor javoblar o'tkazib yuboriladi.
 * `labels` — anamnezga qo'shiladigan savol nomlari (pregnancy/anesthesia).
 */
export function applyQuestionnaire(
  answers: Record<string, string>,
  form: MedicalFormSnapshot,
  labels: Partial<Record<QuestionnaireKey, string>> = {},
): MedicalFormSnapshot {
  const next: MedicalFormSnapshot = { ...form, allergies: [...form.allergies] };
  const a = (k: QuestionnaireKey) => (answers[k] ?? '').trim();

  if (!isNegativeAnswer(a('allergies'))) {
    next.allergies.push({ type: 'other', substance: a('allergies'), severity: 'moderate' });
  }
  if (!isNegativeAnswer(a('chronic'))) {
    next.chronicConditionsText = appendCsv(next.chronicConditionsText, a('chronic'));
  }
  if (!isNegativeAnswer(a('medications'))) {
    next.currentMedicationsText = appendCsv(next.currentMedicationsText, a('medications'));
  }
  for (const k of ['pregnancy', 'anesthesia'] as const) {
    if (!isNegativeAnswer(a(k))) {
      next.anamnez = appendLine(next.anamnez, `${labels[k] ?? k}: ${a(k)}`);
    }
  }
  return next;
}
