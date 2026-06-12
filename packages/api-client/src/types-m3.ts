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
