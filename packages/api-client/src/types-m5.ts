// ===== Prescriptions =====
export type PrescriptionItem = {
  medicationName: string;
  dosage: string;
  frequency: string;
  durationDays?: number;
  instructions?: string;
};

export type Prescription = {
  id: string;
  tenantId: string;
  patientId: string;
  doctorId: string;
  visitNoteId: string | null;
  issuedDate: string;
  items: PrescriptionItem[];
  diagnosis: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreatePrescriptionInput = {
  patientId: string;
  doctorId: string;
  visitNoteId?: string;
  issuedDate?: string;
  items: PrescriptionItem[];
  diagnosis?: string;
  notes?: string;
};

// ===== Consent =====
export type ConsentType = 'treatment' | 'anesthesia' | 'photo' | 'data_processing' | 'other';

export type ConsentTemplate = {
  id: string;
  tenantId: string;
  type: ConsentType;
  title: string;
  bodyUz: string;
  bodyRu: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ConsentForm = {
  id: string;
  tenantId: string;
  patientId: string;
  templateId: string | null;
  type: ConsentType;
  title: string;
  bodyText: string;
  language: string;
  signedAt: string;
  signedByUserId: string;
  patientSignatureName: string | null;
  notes: string | null;
  createdAt: string;
};

export type CreateTemplateInput = {
  type: ConsentType;
  title: string;
  bodyUz: string;
  bodyRu?: string;
  isActive?: boolean;
};

export type SignFormInput = {
  patientId: string;
  templateId?: string;
  type: ConsentType;
  title: string;
  bodyText: string;
  language: 'uz' | 'ru';
  patientSignatureName?: string;
  notes?: string;
};

// ===== Lab Orders =====
export type LabOrderType =
  | 'crown'
  | 'bridge'
  | 'prosthetic'
  | 'aligners'
  | 'denture'
  | 'inlay_onlay'
  | 'other';

export type LabOrderStatus = 'draft' | 'sent' | 'in_progress' | 'ready' | 'delivered' | 'cancelled';

export type LabOrderItem = {
  description: string;
  toothNumbers?: number[];
  material?: string;
  shade?: string;
  quantity?: number;
};

export type LabOrder = {
  id: string;
  tenantId: string;
  patientId: string;
  doctorId: string;
  orderNumber: number | null;
  labName: string;
  orderType: LabOrderType;
  status: LabOrderStatus;
  items: LabOrderItem[];
  sentDate: string | null;
  expectedDate: string | null;
  deliveredDate: string | null;
  cost: string | null;
  currency: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateLabOrderInput = {
  patientId: string;
  doctorId: string;
  labName: string;
  orderType: LabOrderType;
  items: LabOrderItem[];
  expectedDate?: string;
  cost?: number;
  notes?: string;
};

// ===== Patient Images =====
export type PatientImageType =
  | 'xray_panoramic'
  | 'xray_periapical'
  | 'xray_bitewing'
  | 'xray_cbct'
  | 'intraoral_photo'
  | 'face_photo'
  | 'before_after'
  | 'other';

export type PatientImage = {
  id: string;
  tenantId: string;
  patientId: string;
  uploadedByUserId: string | null;
  type: PatientImageType;
  objectKey: string;
  originalFilename: string;
  contentType: string;
  sizeBytes: number;
  title: string | null;
  description: string | null;
  toothNumbers: number[] | null;
  takenDate: string | null;
  createdAt: string;
  url: string;
};
