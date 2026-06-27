import type {
  ConsentForm,
  Diagnosis,
  LabOrderStatus,
  LabOrderType,
  PatientImageType,
  PrescriptionItem,
  ToothState,
  ToothSurface,
  TreatmentPlanStatus,
  TreatmentStageAcceptance,
  TreatmentStageStatus,
} from '@dental/api-client';
import type { StatusPillProps } from '@dental/ui';

export type Tone = NonNullable<StatusPillProps['status']>;

// ===== A: Odontogram =====
export type ToothStateMap = Map<number, ToothState>;

// CLI-189: tish bo'yicha draft (state + yuza + diagnoz).
export type ToothDraft = {
  state: ToothState;
  surface: ToothSurface;
  diagnosisId: string | null;
};
export type ToothDraftMap = Map<number, ToothDraft>;

// ===== A: Treatment plan =====
export type PlanCardVM = {
  id: string;
  title: string;
  status: TreatmentPlanStatus;
  statusTone: Tone;
  statusLabelKey: string;
  totalCostText: string; // formatlangan UZS raqam (i18n-free; valyuta suffiks komponentda)
  totalVisits: number;
};

// ===== DS7: tenant-wide list rows =====
export type PlanListRowVM = {
  id: string;
  patientId: string;
  title: string;
  status: TreatmentPlanStatus;
  statusTone: Tone;
  statusLabelKey: string;
  totalCostText: string;
  totalVisits: number;
  updatedAtText: string;
};

export type LabOrderListRowVM = {
  id: string;
  patientId: string;
  orderNumber: number | null;
  labName: string;
  orderType: LabOrderType;
  typeLabelKey: string;
  status: LabOrderStatus;
  statusTone: Tone;
  statusLabelKey: string;
  costText: string | null;
  currency: string;
  expectedDateText: string | null;
};

export type StageRowVM = {
  id: string;
  sequence: number;
  serviceName: string;
  toothNumbers: number[];
  costText: string;
  status: TreatmentStageStatus;
  statusTone: Tone;
  statusLabelKey: string;
  acceptance: TreatmentStageAcceptance;
  acceptanceTone: Tone;
  acceptanceLabelKey: string;
};

// ===== A: Treatment plan estimate (smeta — CLI-223/224) =====
export type EstimateStageVM = {
  id: string;
  serviceName: string;
  costText: string;
  statusLabelKey: string;
  statusTone: Tone;
  acceptanceLabelKey: string;
  acceptanceTone: Tone;
  paidText: string;
  debtEligible: boolean;
};

export type EstimateVM = {
  planId: string;
  stages: EstimateStageVM[];
  totalProposedText: string;
  totalAcceptedText: string;
  totalCostText: string;
  totalPaidText: string;
  balanceText: string;
  balance: number;
};

// ===== A: Visit note =====
export type VisitNoteVM = {
  id: string;
  visitDateText: string;
  subjective: string | null;
  objective: string | null;
  /** diagnoz teglari: label (komponent uchun tayyor: "code — name") */
  diagnoses: string[];
  plan: string | null;
  freeNotes: string | null;
};

export type DiagnosisOptionVM = { value: string; label: string };

// ===== B: Prescription =====
export type PrescriptionItemVM = {
  medicationName: string;
  dosage: string;
  frequency: string;
  durationDays: number | null;
  instructions: string | null;
};

export type PrescriptionVM = {
  id: string;
  issuedDateText: string;
  diagnosis: string | null;
  items: PrescriptionItemVM[];
  notes: string | null;
};

// ===== B: Lab order =====
export type LabOrderItemVM = {
  description: string;
  toothNumbers: number[];
  material: string | null;
  shade: string | null;
  quantity: number | null;
};

export type LabOrderVM = {
  id: string;
  labName: string;
  orderType: LabOrderType;
  typeLabelKey: string;
  status: LabOrderStatus;
  statusTone: Tone;
  statusLabelKey: string;
  costText: string | null; // null bo'lsa ko'rsatilmaydi
  currency: string;
  items: LabOrderItemVM[];
  sentDateText: string | null;
  expectedDateText: string | null;
  deliveredDateText: string | null;
};

// ===== B: Consent =====
export type ConsentFormVM = {
  id: string;
  title: string;
  type: ConsentForm['type'];
  typeLabelKey: string;
  languageUpper: string;
  signedAtText: string;
  signerName: string | null;
  bodyPreview: string;
};

// ===== C: Image =====
export type PatientImageVM = {
  id: string;
  type: PatientImageType;
  typeLabelKey: string;
  url: string;
  isImage: boolean;
  displayTitle: string;
  originalFilename: string;
  sizeLabel: string;
  toothNumbers: number[];
  takenDate: string | null;
  createdAt: string;
  contentType: string;
  description: string | null;
};

// Lokal re-export (mapper imzolari uchun)
export type { Diagnosis, PrescriptionItem, ToothState, ToothSurface };
