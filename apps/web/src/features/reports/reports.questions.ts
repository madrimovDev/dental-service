/** UI-M2 — hisobotlar «savollar» ro'yxati (kanvas: Reports.dc.html). Sof ma'lumot, React yo'q. */

export type QuestionGroup = 'money' | 'doctors' | 'patients' | 'stockLab';

export type QuestionKey =
  | 'today'
  | 'revenue'
  | 'debt'
  | 'services'
  | 'pnl'
  | 'doctors'
  | 'appointments'
  | 'noshowDoctors'
  | 'newPatients'
  | 'notReturned'
  | 'recall'
  | 'plans'
  | 'stock'
  | 'lab';

export type Question = {
  key: QuestionKey;
  group: QuestionGroup;
  /** Filialga bo'linmaydigan (tenant-darajali) hisobot — filialga tayinlangan xodimga yopiq (IR-06). */
  tenantWide?: boolean;
  /** Backend hali yo'q (boshqa bosqich) — ro'yxatda bor, lekin bosib bo'lmaydi. */
  soon?: boolean;
};

export const QUESTIONS: Question[] = [
  { key: 'today', group: 'money' },
  { key: 'revenue', group: 'money' },
  { key: 'debt', group: 'money', tenantWide: true },
  { key: 'services', group: 'money', tenantWide: true },
  { key: 'pnl', group: 'money', tenantWide: true },
  { key: 'doctors', group: 'doctors' },
  { key: 'appointments', group: 'doctors' },
  { key: 'noshowDoctors', group: 'doctors', soon: true },
  { key: 'newPatients', group: 'patients', tenantWide: true },
  { key: 'notReturned', group: 'patients', soon: true },
  { key: 'recall', group: 'patients', tenantWide: true },
  { key: 'plans', group: 'patients', tenantWide: true },
  { key: 'stock', group: 'stockLab', soon: true },
  { key: 'lab', group: 'stockLab', soon: true },
];

export const QUESTION_GROUPS: QuestionGroup[] = ['money', 'doctors', 'patients', 'stockLab'];

export const DEFAULT_QUESTION: QuestionKey = 'today';

export const findQuestion = (key: string | null | undefined): Question | undefined =>
  QUESTIONS.find((q) => q.key === key);

export type QuestionLock = 'soon' | 'clinicWide' | null;

/** `allowAllBranches=false` (filialga tayinlangan xodim) — tenant-darajali savollar yopiq. */
export const questionLock = (q: Question, allowAllBranches: boolean): QuestionLock => {
  if (q.soon) return 'soon';
  if (q.tenantWide && !allowAllBranches) return 'clinicWide';
  return null;
};

/** URL `q` parametri → ochiladigan savol (noto'g'ri/yopiq → birinchi ochiq savol). */
export const resolveQuestion = (raw: string | null, allowAllBranches: boolean): Question => {
  const asked = findQuestion(raw);
  if (asked && !questionLock(asked, allowAllBranches)) return asked;
  const fallback = QUESTIONS.find((q) => !questionLock(q, allowAllBranches));
  return fallback ?? (QUESTIONS[0] as Question);
};
