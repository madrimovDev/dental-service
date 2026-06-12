// R4 Guruh A — Expenses, Patient relatives, Stock

export type ExpenseCategory = {
  id: string;
  tenantId: string;
  name: string;
  nameRu: string | null;
  createdAt: string;
};

export type Expense = {
  id: string;
  tenantId: string;
  branchId: string | null;
  categoryId: string | null;
  amount: string;
  date: string;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
};

export type ExpenseSummary = {
  byCategory: Array<{ categoryId: string | null; total: string; count: number }>;
  grandTotal: number;
};

export type PatientRelativeView = {
  id: string;
  relativePatient: { id: string; fullName: string };
  relationship: string;
  direction: 'outgoing' | 'incoming';
};

export type StockItem = {
  id: string;
  tenantId: string;
  branchId: string | null;
  name: string;
  unit: string;
  quantity: string;
  minThreshold: string;
  createdAt: string;
  updatedAt: string;
};

export type StockItemWithLowStock = StockItem & { lowStock: boolean };

export type StockMovementType = 'in' | 'out' | 'adjustment';

export type StockMovement = {
  id: string;
  tenantId: string;
  itemId: string;
  type: StockMovementType;
  quantity: string;
  reason: string | null;
  sourceVisitNoteId: string | null;
  createdBy: string | null;
  createdAt: string;
};

export type ServiceMaterial = {
  id: string;
  tenantId: string;
  serviceId: string;
  itemId: string;
  qtyPerService: string;
  createdAt: string;
};
