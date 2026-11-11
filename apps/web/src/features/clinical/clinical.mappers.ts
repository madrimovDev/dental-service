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
  ToothState,
  ToothSurface,
  TreatmentPlan,
  TreatmentPlanEstimate,
  TreatmentPlanStatus,
  TreatmentStage,
  TreatmentStageAcceptance,
  TreatmentStageStatus,
  VisitNote,
} from '@dental/api-client';
import { formatNumber } from '@/lib/format.ts';
import type {
  ConsentFormVM,
  DiagnosisOptionVM,
  EstimateStageVM,
  EstimateVM,
  LabOrderListRowVM,
  LabOrderVM,
  PatientImageVM,
  PlanCardVM,
  PlanListRowVM,
  PrescriptionVM,
  StageRowVM,
  Tone,
  ToothDisplay,
  ToothEntry,
  ToothEntryGroup,
  ToothHistoryRow,
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

// ===== UI-D3: odontogram draft (bitta tishga bir nechta tashxis) =====
const entryKey = (e: ToothEntry) => `${e.toothNumber}:${e.surface}:${e.diagnosisId ?? '-'}`;

/** Snapshot → draft qatorlar (hech narsa tashlanmaydi; bir xil tish+yuza+tashxis qisqaradi). */
export function toToothEntries(
  chart: Pick<ToothChartWithStates, 'states'> | null | undefined,
): ToothEntry[] {
  const byKey = new Map<string, ToothEntry>();
  for (const s of chart?.states ?? []) {
    const e: ToothEntry = {
      toothNumber: s.toothNumber,
      surface: (s.surface ?? 'whole') as ToothSurface,
      state: s.state,
      diagnosisId: s.diagnosisId ?? null,
    };
    byKey.set(entryKey(e), e);
  }
  return [...byKey.values()];
}

export function entriesToCreateInput(entries: ToothEntry[]): CreateToothStateInput[] {
  return entries.map((e) => ({
    toothNumber: e.toothNumber,
    state: e.state,
    surface: e.surface,
    diagnosisId: e.diagnosisId ?? undefined,
  }));
}

/**
 * Tishga holat/tashxis qo'shish: har yuza (bo'sh = 'whole') uchun qator. Shu tish+yuza+tashxis
 * kombinatsiyasi bo'lsa almashtiriladi (takror yo'q); BOSHQA tashxis qatorlari saqlanadi.
 */
export function addToothEntries(
  entries: ToothEntry[],
  add: {
    toothNumber: number;
    surfaces: ToothSurface[];
    state: ToothState;
    diagnosisId: string | null;
  },
): ToothEntry[] {
  const surfaces: ToothSurface[] = add.surfaces.length > 0 ? add.surfaces : ['whole'];
  const incoming: ToothEntry[] = surfaces.map((surface) => ({
    toothNumber: add.toothNumber,
    surface,
    state: add.state,
    diagnosisId: add.diagnosisId,
  }));
  const keys = new Set(incoming.map(entryKey));
  return [...entries.filter((e) => !keys.has(entryKey(e))), ...incoming];
}

export const toothGroupKey = (g: { state: ToothState; diagnosisId: string | null }) =>
  `${g.state}:${g.diagnosisId ?? '-'}`;

/** Tishdagi (holat, tashxis) bo'yicha guruhlar — «Shu tishdagi tashxislar» chiplari. */
export function groupToothEntries(entries: ToothEntry[], toothNumber: number): ToothEntryGroup[] {
  const groups = new Map<string, ToothEntryGroup>();
  for (const e of entries) {
    if (e.toothNumber !== toothNumber) continue;
    const key = toothGroupKey(e);
    const g = groups.get(key);
    if (g) g.surfaces.push(e.surface);
    else
      groups.set(key, { key, state: e.state, diagnosisId: e.diagnosisId, surfaces: [e.surface] });
  }
  return [...groups.values()];
}

export function removeToothGroup(
  entries: ToothEntry[],
  toothNumber: number,
  groupKey: string,
): ToothEntry[] {
  return entries.filter((e) => !(e.toothNumber === toothNumber && toothGroupKey(e) === groupKey));
}

/** Tish → katak ko'rinishi: 'whole' holat ustun, aks holda birinchi sog'lom bo'lmagan yuza. */
export function toToothDisplayMap(entries: ToothEntry[]): Map<number, ToothDisplay> {
  const out = new Map<number, ToothDisplay>();
  for (const e of entries) {
    const d = out.get(e.toothNumber) ?? { state: 'healthy' as ToothState, surfaceStates: {} };
    d.surfaceStates[e.surface] = e.state;
    out.set(e.toothNumber, d);
  }
  for (const d of out.values()) {
    const whole = d.surfaceStates.whole;
    d.state =
      whole && whole !== 'healthy'
        ? whole
        : (Object.values(d.surfaceStates).find((s) => s && s !== 'healthy') ?? 'healthy');
  }
  return out;
}

/** Davolash rejalaridagi faol (bajarilmagan) bosqichlarning tishlari — «Reja» ko'rinishi. */
export function plannedTeethFromPlans(
  plans: Array<Pick<TreatmentPlan, 'status'> & { stages?: TreatmentStage[] }> | undefined,
): Set<number> {
  const out = new Set<number>();
  for (const plan of plans ?? []) {
    if (plan.status === 'cancelled' || plan.status === 'completed') continue;
    for (const st of plan.stages ?? []) {
      if (st.status === 'completed' || st.status === 'skipped') continue;
      for (const n of st.toothNumbers ?? []) out.add(n);
    }
  }
  return out;
}

/** «Tish N tarixi»: snapshot'lar bo'yicha shu tish qatorlari (yangisi birinchi). */
export function toothHistoryRows(
  history: Array<Pick<ToothChartWithStates, 'id' | 'createdAt' | 'states'>> | undefined,
  toothNumber: number,
): ToothHistoryRow[] {
  const rows: ToothHistoryRow[] = [];
  for (const chart of history ?? []) {
    for (const g of groupToothEntries(toToothEntries(chart), toothNumber)) {
      rows.push({
        chartId: chart.id,
        createdAt: chart.createdAt,
        state: g.state,
        diagnosisId: g.diagnosisId,
        surfaces: g.surfaces,
      });
    }
  }
  return rows;
}

/** ICD-10 kodidan tish holati taklifi (K02/K04 → kariyes, K08.1–K08.2 → yo'q); aks holda `null`. */
export function suggestedStateForDiagnosis(d: Pick<Diagnosis, 'code'>): ToothState | null {
  if (d.code.startsWith('K02') || d.code.startsWith('K04')) return 'caries';
  if (d.code.startsWith('K08.1') || d.code.startsWith('K08.2')) return 'missing';
  return null;
}

export function dxName(d: Diagnosis, lang: Lang): string {
  return lang === 'ru' ? d.nameRu : d.nameUz;
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

// CLI-224: acceptance — status'dan alohida o'q (qabul = qarzga kiradi).
const ACCEPTANCE_TONE: Record<TreatmentStageAcceptance, Tone> = {
  proposed: 'info',
  accepted: 'success',
  rejected: 'danger',
};

export const stageAcceptanceToTone = (a: TreatmentStageAcceptance): Tone => ACCEPTANCE_TONE[a];

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

// DS7: tenant-wide reja qatori (ism alohida hal qilinadi — list javobida yo'q).
export function toPlanListRowVM(plan: TreatmentPlan): PlanListRowVM {
  return {
    id: plan.id,
    patientId: plan.patientId,
    title: plan.title,
    status: plan.status,
    statusTone: PLAN_TONE[plan.status],
    statusLabelKey: `treatment_plan.status_${plan.status}`,
    totalCostText: formatNumber(Number(plan.totalCost)),
    totalVisits: plan.totalVisits,
    updatedAtText: dt(plan.updatedAt),
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
    acceptance: stage.acceptance,
    acceptanceTone: ACCEPTANCE_TONE[stage.acceptance],
    acceptanceLabelKey: `treatment_plan.acceptance_${stage.acceptance}`,
  };
}

// ===== A: treatment plan estimate (smeta — CLI-223/224) =====
function toEstimateStageVM(stage: TreatmentPlanEstimate['stages'][number]): EstimateStageVM {
  return {
    id: stage.stageId,
    serviceName: stage.serviceName,
    costText: formatNumber(stage.cost),
    statusLabelKey: `treatment_plan.stage_status_${stage.status}`,
    statusTone: STAGE_TONE[stage.status],
    acceptanceLabelKey: `treatment_plan.acceptance_${stage.acceptance}`,
    acceptanceTone: ACCEPTANCE_TONE[stage.acceptance],
    paidText: formatNumber(stage.paid),
    debtEligible: stage.debtEligible,
  };
}

export function toEstimateVM(est: TreatmentPlanEstimate): EstimateVM {
  return {
    planId: est.planId,
    stages: est.stages.map(toEstimateStageVM),
    totalProposedText: formatNumber(est.totalProposed),
    totalAcceptedText: formatNumber(est.totalAccepted),
    totalCostText: formatNumber(est.totalCost),
    totalPaidText: formatNumber(est.totalPaid),
    balanceText: formatNumber(est.balance),
    balance: est.balance,
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

/**
 * B2 (CLI-439): lab-order forward-only lifecycle — `draft → sent → in_progress →
 * ready → delivered`, `cancelled` istalgan tugallanmagan holatdan (delivered/cancelled
 * TERMINAL). Backend'da hali guard YO'Q (`lab-orders.service.ts` istalgan status→status
 * qabul qiladi) — bu frontend-only cheklov, LabOrdersTab Select'ida 6ta statusni
 * shartsiz ko'rsatish o'rniga faqat joriy+ruxsat etilgan keyingi statuslarni beradi.
 * Backend guard qo'shilganda (Qaror #25 uslubi) bu jadval backend bilan moslashtirilsin.
 */
const LAB_ORDER_TRANSITIONS: Record<LabOrderStatus, readonly LabOrderStatus[]> = {
  draft: ['sent', 'cancelled'],
  sent: ['in_progress', 'cancelled'],
  in_progress: ['ready', 'cancelled'],
  ready: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: [],
};

/** Joriy status + undan ruxsat etilgan keyingi statuslar (Select opsiyalari uchun). */
export function allowedLabOrderStatuses(current: LabOrderStatus): LabOrderStatus[] {
  return [current, ...LAB_ORDER_TRANSITIONS[current]];
}

// DS7: tenant-wide lab buyurtma qatori (ism alohida hal qilinadi).
export function toLabOrderListRowVM(order: LabOrder): LabOrderListRowVM {
  return {
    id: order.id,
    patientId: order.patientId,
    orderNumber: order.orderNumber,
    labName: order.labName,
    orderType: order.orderType,
    typeLabelKey: `lab_order.type_${order.orderType}`,
    status: order.status,
    statusTone: LAB_TONE[order.status],
    statusLabelKey: `lab_order.status_${order.status}`,
    costText: order.cost ? formatNumber(Number(order.cost)) : null,
    currency: order.currency,
    expectedDateText: order.expectedDate ? dt(order.expectedDate) : null,
  };
}

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
  // CLI-461: gate bilan bir xil qoida (backend `isConsentFormCurrentlyValid`) —
  // isPerpetual=true YOKI expiresAt hali kelmagan bo'lsa "amaldagi".
  const isValid = form.isPerpetual || (!!form.expiresAt && new Date(form.expiresAt) > new Date());
  return {
    id: form.id,
    title: form.title,
    type: form.type,
    typeLabelKey: `consent.type_${form.type}`,
    languageUpper: form.language.toUpperCase(),
    signedAtText: dts(form.signedAt),
    signerName: form.patientSignatureName || null,
    bodyPreview: form.bodyText.length > 240 ? `${trimmed}...` : trimmed,
    isPerpetual: form.isPerpetual,
    expiryText: form.expiresAt ? dt(form.expiresAt) : null,
    isValid,
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
