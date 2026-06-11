export type AuditLogEntry = {
  id: string;
  tenantId: string | null;
  userId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  before: unknown;
  after: unknown;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
};

export type AuditListResponse = {
  data: AuditLogEntry[];
  meta: { page: number; pageSize: number; total: number };
};
