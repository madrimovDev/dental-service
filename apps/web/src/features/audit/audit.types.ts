/** Audit log so'rovi filtr/paginatsiya parametrlari (UI state). */
export type AuditListParams = {
  from?: string;
  to?: string;
  action?: string;
  resourceType?: string;
  userId?: string;
  page?: number;
  pageSize?: number;
};

/** Jadval qatori uchun view-model (DTO → ko'rinish). */
export type AuditRowVM = {
  id: string;
  whenText: string;
  userId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  before: unknown;
  after: unknown;
  ip: string | null;
  userAgent: string | null;
  hasDetail: boolean;
};
