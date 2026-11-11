export type CaseStatus =
  | 'sent'
  | 'accepted'
  | 'in_progress'
  | 'ready'
  | 'rejected'
  | 'delivered'
  | 'remake';

export type TabKey = 'new' | 'in_work' | 'ready' | 'shipped' | 'rejected';
export const TAB_KEYS: TabKey[] = ['new', 'in_work', 'ready', 'shipped', 'rejected'];

export type CaseDto = {
  id: string;
  labId: string;
  clinicId: string;
  clinicName: string | null;
  clinicCaseRef: string;
  patientName: string | null;
  patientSex: 'male' | 'female' | null;
  patientAge: number | null;
  clinicCode: string | null;
  doctorName: string | null;
  teeth: number[];
  workType: string;
  material: string | null;
  shade: string | null;
  dueDate: string | null;
  note: string | null;
  status: CaseStatus;
  rejectReason: string | null;
  assignedTechnicianId: string | null;
  proposedPrice: string | null;
  approvedPrice: string | null;
  approvedAt: string | null;
  sentAt: string;
  readyAt: string | null;
  deliveredAt: string | null;
  purgedAt: string | null;
  updatedAt: string;
};

export type CaseFile = {
  id: string;
  fileName: string | null;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: 'clinic' | 'lab';
  createdAt: string;
};

export type CaseMessage = {
  id: string;
  author: 'clinic' | 'lab';
  authorName: string | null;
  body: string | null;
  fileId: string | null;
  createdAt: string;
};

export type CaseDetail = {
  case: CaseDto & { technicianName: string | null };
  files: CaseFile[];
  messages: CaseMessage[];
};

export type CasesResponse = { cases: CaseDto[]; tabCounts: Record<TabKey, number> };

export type LabUserDto = {
  id: string;
  fullName: string;
  phone: string;
  role: 'lead' | 'technician';
  isActive: boolean;
  mustChangePassword: boolean;
  createdAt: string;
};

export type PriceItem = {
  id: string;
  workType: string;
  material: string | null;
  price: string;
  isActive: boolean;
};
