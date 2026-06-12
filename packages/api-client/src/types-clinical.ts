// ===== Tooth Chart (Odontogram) — hand enums (generated uses ToothStateEntrySurface/ToothStateEntryState) =====
// Kept because web components import these names directly (OdontogramTab, ToothCell, Odontogram, etc.)
export type ToothSurface = 'whole' | 'M' | 'D' | 'B' | 'L' | 'O' | 'I';

export type ToothState =
  | 'healthy'
  | 'caries'
  | 'filling'
  | 'crown'
  | 'implant'
  | 'missing'
  | 'root_canal'
  | 'to_extract'
  | 'temporary'
  | 'veneer';

// ===== Inputs =====
export type CreateTreatmentStageInput = {
  serviceId?: string;
  serviceName: string;
  toothNumbers?: number[];
  estimatedVisits?: number;
  estimatedDurationMinutes?: number;
  cost: number;
  notes?: string;
};

export type CreateTreatmentPlanInput = {
  patientId: string;
  doctorId: string;
  title: string;
  notes?: string;
  stages: CreateTreatmentStageInput[];
};

export type CreateToothStateInput = {
  toothNumber: number;
  surface?: ToothSurface;
  state: ToothState;
  diagnosisId?: string;
  notes?: string;
};

export type CreateToothChartInput = {
  patientId: string;
  visitNoteId?: string;
  isPrimaryDentition?: boolean;
  notes?: string;
  states: CreateToothStateInput[];
};

export type CreateVisitNoteInput = {
  patientId: string;
  doctorId: string;
  appointmentId?: string;
  visitDate?: string;
  subjective?: string;
  objective?: string;
  assessmentDiagnoses?: string[];
  plan?: string;
  performedServices?: string[];
  freeNotes?: string;
};
