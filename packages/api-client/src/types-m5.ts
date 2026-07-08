import type { PrescriptionItem } from './generated/model/index.ts';

// ===== Prescriptions — Input types =====
// PrescriptionItem: from generated (same shape, no re-export needed here — barrel adds it explicitly)

export type CreatePrescriptionInput = {
  patientId: string;
  doctorId: string;
  visitNoteId?: string;
  issuedDate?: string;
  items: PrescriptionItem[];
  diagnosis?: string;
  notes?: string;
};

// ===== Consent — hand type aliases =====
// ConsentType: kept because web components import it directly (ConsentTab uses ConsentType[])
// Generated uses ConsentFormType / ConsentTemplateType (different names)
export type ConsentType = 'treatment' | 'anesthesia' | 'photo' | 'data_processing' | 'other';

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
  // CLI-461: muddat — treatment-plan accept gate shu ikkalasiga tayanadi.
  isPerpetual?: boolean;
  expiresAt?: string;
};

// ===== Lab Orders — hand type aliases =====
// LabOrderType: kept because web uses LabOrderType[] in UI, LabOrderVM.orderType typed as LabOrderType
// Generated uses LabOrderOrderType (different name)
export type LabOrderType =
  | 'crown'
  | 'bridge'
  | 'prosthetic'
  | 'aligners'
  | 'denture'
  | 'inlay_onlay'
  | 'other';

// LabOrderItem: kept because CreateLabOrderInput.items uses it and LabOrdersTab imports it
// Generated uses LabOrderItemsItem (different name)
export type LabOrderItem = {
  description: string;
  toothNumbers?: number[];
  material?: string;
  shade?: string;
  quantity?: number;
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

// ===== Patient Images — Wave C (NOT migrated yet, keep as-is) =====
export type PatientImageType =
  | 'xray_panoramic'
  | 'xray_periapical'
  | 'xray_bitewing'
  | 'xray_cbct'
  | 'intraoral_photo'
  | 'face_photo'
  | 'before_after'
  | 'other';

// PatientImage RESPONSE tipi generated model'ga ko'chdi (CLI-146); barrel generated'dan
// re-eksport qiladi. PatientImageType + request/enum tiplari shu yerda HAND qoladi
// (web formlar va ImageUploadModal ishlatadi; generated *Body boshqa nom).
