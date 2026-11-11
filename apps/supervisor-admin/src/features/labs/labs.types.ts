export type LabSubscription = 'active' | 'grace' | 'expired';

export interface Lab {
  id: string;
  name: string;
  city: string | null;
  description: string | null;
  catalogVisible: boolean;
  expiresAt: string;
  subscription: LabSubscription;
  createdAt: string;
}

export interface CreateLabInput {
  name: string;
  city?: string;
  description?: string;
  catalogVisible: boolean;
  /** YYYY-MM-DD — server kun oxirigacha (UTC) qiladi. */
  expiresAt: string;
  leadFullName: string;
  leadPhone: string;
}

export interface CreateLabResult {
  lab: Lab;
  lead: { fullName: string; phone: string; tempPassword: string };
}

export interface UpdateLabInput {
  expiresAt?: string;
  catalogVisible?: boolean;
}
