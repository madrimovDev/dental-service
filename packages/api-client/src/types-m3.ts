export type Service = {
  id: string;
  tenantId: string;
  code: string;
  nameUz: string;
  nameRu: string | null;
  category: string | null;
  durationMinutes: number;
  requiredRole: string | null;
  descriptionUz: string | null;
  descriptionRu: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type ServicePrice = {
  id: string;
  serviceId: string;
  branchId: string;
  price: string;
  currency: string;
  validFrom: string;
  validTo: string | null;
  createdAt: string;
};

export type ServiceWithPrices = Service & { prices: ServicePrice[] };

export type PaymentMethod = 'cash' | 'card' | 'transfer' | 'other';
export type TransactionType = 'payment' | 'refund' | 'void';
export type TransactionStatus = 'pending' | 'completed' | 'voided';

export type CashierTransaction = {
  id: string;
  tenantId: string;
  branchId: string;
  patientId: string | null;
  treatmentPlanId: string | null;
  receiptNumber: string | null;
  totalAmount: string;
  paidAmount: string;
  discount: string;
  currency: string;
  paymentMethod: PaymentMethod;
  type: TransactionType;
  parentTransactionId: string | null;
  status: TransactionStatus;
  notes: string | null;
  fiscalProvider: string;
  fiscalReceiptId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CashierTransactionItem = {
  id: string;
  transactionId: string;
  serviceId: string | null;
  serviceName: string;
  quantity: number;
  unitPrice: string;
  subtotal: string;
};

export type CashierTransactionWithItems = CashierTransaction & { items: CashierTransactionItem[] };

export type CashierListResponse = {
  data: CashierTransaction[];
  meta: { page: number; pageSize: number; total: number };
};

export type DailySummary = {
  date: string;
  branchId: string;
  breakdown: Array<{
    paymentMethod: PaymentMethod;
    type: TransactionType;
    total: string;
    count: number;
  }>;
};

export type StageBalance = {
  stageId: string;
  serviceName: string;
  cost: number;
  paid: number;
  remaining: number;
};

export type PlanBalance = {
  totalCost: number;
  totalPaid: number;
  balance: number;
  stages: StageBalance[];
};

export type AppointmentStatus =
  | 'scheduled'
  | 'confirmed'
  | 'in_progress'
  | 'completed'
  | 'no_show'
  | 'cancelled';

export type Appointment = {
  id: string;
  tenantId: string;
  branchId: string;
  patientId: string;
  doctorId: string;
  assistantId: string | null;
  startTime: string;
  endTime: string;
  status: AppointmentStatus;
  serviceIds: string[] | null;
  notes: string | null;
  cancellationReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type QueueStatus = 'waiting' | 'in_progress' | 'done' | 'missed';

export type QueueTicket = {
  id: string;
  tenantId: string;
  branchId: string;
  patientId: string | null;
  serviceId: string | null;
  doctorId: string | null;
  appointmentId: string | null;
  queueNumber: number;
  ticketDate: string;
  status: QueueStatus;
  calledAt: string | null;
  finishedAt: string | null;
  createdAt: string;
};
