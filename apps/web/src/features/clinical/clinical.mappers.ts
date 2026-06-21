import type {
  ConsentForm,
  ConsentTemplate,
  CreateToothStateInput,
  Diagnosis,
  LabOrder,
  LabOrderStatus,
  PatientImage,
  Prescription,
  ServicePrice,
  ToothChartWithStates,
  TreatmentPlan,
  TreatmentPlanStatus,
  TreatmentStage,
  TreatmentStageStatus,
  VisitNote,
} from '@dental/api-client';
import type {
  ConsentFormVM,
  DiagnosisOptionVM,
  LabOrderVM,
  PatientImageVM,
  PlanCardVM,
  PrescriptionVM,
  StageRowVM,
  Tone,
  ToothStateMap,
  VisitNoteVM,
} from './clinical.types';

type Lang = 'uz' | 'ru';

// ===== shared =====
const num = (raw: string | number) => Number(raw).toLocaleString();
// O'zbek UI uchun deterministik format: DD.MM.YYYY va DD.MM.YYYY, HH:mm (24-soat).
// `toLocaleString()` runtime locale'iga tayanardi → amerikacha M/D/YYYY AM/PM (CLI-152).
const p2 = (n: number) => String(n).padStart(2, '0');
const dt = (iso: string) => {
  const d = new Date(iso);
  return `${p2(d.getDate())}.${p2(d.getMonth() + 1)}.${d.getFullYear()}`;
};
const dts = (iso: string) => {
  const d = new Date(iso);
  return `${dt(iso)}, ${p2(d.getHours())}:${p2(d.getMinutes())}`;
};

export function parseToothNumbers(csv: string): number[] {
  if (!csv) return [];
  return csv
    .split(',')
    .map((n) => Number(n.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
}

function dxLabel(d: Diagnosis, lang: Lang): string {
  return `${d.code} — ${lang === 'ru' ? d.nameRu : d.nameUz}`;
}

// ===== A: tooth chart =====
export function toToothStateMap(chart: ToothChartWithStates | null): ToothStateMap {
  const map: ToothStateMap = new Map();
  if (!chart) return map;
  for (const s of chart.states) {
    if (s.surface === 'whole') map.set(s.toothNumber, s.state);
  }
  return map;
}

export function draftStatesToCreateInput(map: ToothStateMap): CreateToothStateInput[] {
  return Array.from(map.entries()).map(([toothNumber, state]) => ({
    toothNumber,
    state,
    surface: 'whole' as const,
  }));
}

// ===== A: treatment plan =====
const PLAN_TONE: Record<TreatmentPlanStatus, Tone> = {
  draft: 'neutral',
  presented: 'info',
  accepted: 'accent',
  in_progress: 'warning',
  completed: 'success',
  cancelled: 'danger',
};

const STAGE_TONE: Record<TreatmentStageStatus, Tone> = {
  pending: 'neutral',
  in_progress: 'warning',
  completed: 'success',
  skipped: 'danger',
};

/**
 * CLI-188: tanlangan filial uchun amaldagi xizmat narxini topadi (sof).
 * `validTo === null` (joriy amaldagi) + `branchId` mos qator; bir nechta active
 * bo'lsa eng oxirgi `validFrom`. Topilmasa null → qo'lda kiritiladi.
 * (Cashier'dagi `findActivePrice` bilan bir xil mantiq — dental seam'ni saqlash uchun
 * import qilinmaydi, replikatsiya qilinadi.)
 */
export function findActivePrice(prices: ServicePrice[], branchId: string): number | null {
  const active = prices
    .filter((p) => p.branchId === branchId && p.validTo === null)
    .sort((a, b) => b.validFrom.localeCompare(a.validFrom));
  const top = active[0];
  return top ? Number(top.price) : null;
}

export const planStatusToTone = (s: TreatmentPlanStatus): Tone => PLAN_TONE[s];
export const stageStatusToTone = (s: TreatmentStageStatus): Tone => STAGE_TONE[s];

export function toPlanCardVM(plan: TreatmentPlan): PlanCardVM {
  return {
    id: plan.id,
    title: plan.title,
    status: plan.status,
    statusTone: PLAN_TONE[plan.status],
    statusLabelKey: `treatment_plan.status_${plan.status}`,
    totalCostText: num(plan.totalCost),
    totalVisits: plan.totalVisits,
  };
}

export function toStageRowVM(stage: TreatmentStage): StageRowVM {
  return {
    id: stage.id,
    sequence: stage.sequence,
    serviceName: stage.serviceName,
    toothNumbers: stage.toothNumbers ?? [],
    costText: num(stage.cost),
    status: stage.status,
    statusTone: STAGE_TONE[stage.status],
    statusLabelKey: `treatment_plan.stage_status_${stage.status}`,
  };
}

// ===== A: visit note =====
export function toVisitNoteVM(
  note: VisitNote,
  diagnosisMap: Map<string, Diagnosis>,
  lang: Lang,
): VisitNoteVM {
  return {
    id: note.id,
    visitDateText: dts(note.visitDate),
    subjective: note.subjective || null,
    objective: note.objective || null,
    diagnoses: (note.assessmentDiagnoses ?? []).map((id) => {
      const d = diagnosisMap.get(id);
      return d ? dxLabel(d, lang) : id;
    }),
    plan: note.plan || null,
    freeNotes: note.freeNotes || null,
  };
}

export function toDiagnosisOptions(diagnoses: Diagnosis[], lang: Lang): DiagnosisOptionVM[] {
  return diagnoses.map((d) => ({ value: d.id, label: dxLabel(d, lang) }));
}

/** Diakritika-befarq normalizatsiya (ICD-10 qidiruv uchun). */
export const normalizeSearch = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** ICD-10 picker filtri uchun id→qidiruv-indeks (`code + nameUz + nameRu`, normalizatsiyalangan). */
export function diagnosisSearchIndex(diagnoses: Diagnosis[]): Map<string, string> {
  return new Map(
    diagnoses.map((d) => [d.id, normalizeSearch(`${d.code} ${d.nameUz} ${d.nameRu}`)]),
  );
}

// ===== B: prescription =====
export function toPrescriptionVM(rx: Prescription): PrescriptionVM {
  return {
    id: rx.id,
    issuedDateText: dt(rx.issuedDate),
    diagnosis: rx.diagnosis || null,
    notes: rx.notes || null,
    items: rx.items.map((it) => ({
      medicationName: it.medicationName,
      dosage: it.dosage,
      frequency: it.frequency,
      durationDays: it.durationDays ?? null,
      instructions: it.instructions ?? null,
    })),
  };
}

// ===== B: lab order =====
const LAB_TONE: Record<LabOrderStatus, Tone> = {
  draft: 'neutral',
  sent: 'info',
  in_progress: 'warning',
  ready: 'success',
  delivered: 'accent',
  cancelled: 'danger',
};

export const labOrderStatusToTone = (s: LabOrderStatus): Tone => LAB_TONE[s];

export function toLabOrderVM(order: LabOrder): LabOrderVM {
  return {
    id: order.id,
    labName: order.labName,
    orderType: order.orderType,
    typeLabelKey: `lab_order.type_${order.orderType}`,
    status: order.status,
    statusTone: LAB_TONE[order.status],
    statusLabelKey: `lab_order.status_${order.status}`,
    costText: order.cost ? num(order.cost) : null,
    currency: order.currency,
    items: order.items.map((it) => ({
      description: it.description,
      toothNumbers: it.toothNumbers ?? [],
      material: it.material ?? null,
      shade: it.shade ?? null,
      quantity: it.quantity ?? null,
    })),
    sentDateText: order.sentDate ? dt(order.sentDate) : null,
    expectedDateText: order.expectedDate ? dt(order.expectedDate) : null,
    deliveredDateText: order.deliveredDate ? dt(order.deliveredDate) : null,
  };
}

// ===== B: consent =====
export function toConsentFormVM(form: ConsentForm): ConsentFormVM {
  const trimmed = form.bodyText.slice(0, 240);
  return {
    id: form.id,
    title: form.title,
    type: form.type,
    typeLabelKey: `consent.type_${form.type}`,
    languageUpper: form.language.toUpperCase(),
    signedAtText: dts(form.signedAt),
    signerName: form.patientSignatureName || null,
    bodyPreview: form.bodyText.length > 240 ? `${trimmed}...` : trimmed,
  };
}

export function templateBodyForLang(tpl: ConsentTemplate, lang: 'uz' | 'ru'): string {
  return (lang === 'ru' ? tpl.bodyRu : null) || tpl.bodyUz;
}

// ===== C: image =====
export function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(2)} MB`;
}

export function toPatientImageVM(dto: PatientImage): PatientImageVM {
  return {
    id: dto.id,
    type: dto.type,
    typeLabelKey: `image.type_${dto.type}`,
    url: dto.url,
    isImage: dto.contentType.startsWith('image/'),
    displayTitle: dto.title ?? dto.originalFilename,
    originalFilename: dto.originalFilename,
    sizeLabel: formatBytes(dto.sizeBytes),
    toothNumbers: dto.toothNumbers ?? [],
    takenDate: dto.takenDate,
    createdAt: dto.createdAt,
    contentType: dto.contentType,
    description: dto.description,
  };
}
