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

export type StageRowVM = {
  id: string;
  sequence: number;
  serviceName: string;
  toothNumbers: number[];
  costText: string;
  status: TreatmentStageStatus;
  statusTone: Tone;
  statusLabelKey: string;
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
