// ===== Treatment Plans =====
export type TreatmentPlanStatus =
  | 'draft'
  | 'presented'
  | 'accepted'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export type TreatmentStageStatus = 'pending' | 'in_progress' | 'completed' | 'skipped';

export type TreatmentStage = {
  id: string;
  treatmentPlanId: string;
  sequence: number;
  serviceId: string | null;
  serviceName: string;
  toothNumbers: number[] | null;
  estimatedVisits: number;
  estimatedDurationMinutes: number | null;
  cost: string;
  status: TreatmentStageStatus;
  notes: string | null;
  completedAt: string | null;
  createdAt: string;
};

export type TreatmentPlan = {
  id: string;
  tenantId: string;
  patientId: string;
  doctorId: string;
  title: string;
  status: TreatmentPlanStatus;
  totalCost: string;
  totalVisits: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TreatmentPlanWithStages = TreatmentPlan & { stages: TreatmentStage[] };

// ===== Visit Notes (SOAP) =====
export type VisitNote = {
  id: string;
  tenantId: string;
  patientId: string;
  doctorId: string;
  appointmentId: string | null;
  visitDate: string;
  subjective: string | null;
  objective: string | null;
  assessmentDiagnoses: string[];
  plan: string | null;
  performedServices: string[];
  freeNotes: string | null;
  createdAt: string;
  updatedAt: string;
};

// ===== Tooth Chart (Odontogram) =====
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

export type ToothStateEntry = {
  id: string;
  toothChartId: string;
  toothNumber: number;
  surface: ToothSurface;
  state: ToothState;
  diagnosisId: string | null;
  notes: string | null;
  createdAt: string;
};

export type ToothChart = {
  id: string;
  tenantId: string;
  patientId: string;
  visitNoteId: string | null;
  isPrimaryDentition: boolean;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
};

export type ToothChartWithStates = ToothChart & { states: ToothStateEntry[] };

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
