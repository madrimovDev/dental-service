/**
 * API endpoint types — backend bilan parallel saqlanadi.
 * Kelajakda OpenAPI codegen bilan auto-generate qilinishi mumkin.
 */

export type LoginResponse = {
  user: { id: string; email: string; fullName: string | null; lang: string };
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: string;
};

export type RegisterTenantResponse = {
  userId: string;
  tenantId: string;
  slug: string;
  branchId: string;
};

export type MembershipsResponse = {
  userId: string;
  assignments: Array<{
    tenantId: string;
    tenantName: string;
    tenantSlug: string;
    branchId: string | null;
    branchName: string | null;
    roleId: string;
    roleName: string;
    isOwner: boolean;
  }>;
  ownerTenants: Array<{
    tenantId: string;
    tenantName: string;
    tenantSlug: string;
  }>;
};

export type SwitchWorkspaceResponse = {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: string;
};

export type RefreshResponse = {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: string;
};

export type Tenant = {
  id: string;
  name: string;
  slug: string;
  ownerUserId: string;
  defaultLanguage: string;
  subscriptionStatus: 'trial' | 'active' | 'suspended' | 'cancelled';
  trialEndsAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Branch = {
  id: string;
  tenantId: string;
  name: string;
  address: string | null;
  phone: string | null;
  workHours: Record<string, { open: string; close: string } | null> | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type Role = {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  isTemplate: boolean;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
  permissions?: string[];
};

export type PermissionDef = {
  id: string;
  code: string;
  category: string;
  descriptionUz: string | null;
  descriptionRu: string | null;
};

export type UserAssignment = {
  assignmentId: string;
  userId: string;
  userEmail: string;
  userPhone: string | null;
  userFullName: string | null;
  branchId: string | null;
  branchName: string | null;
  roleId: string;
  roleName: string;
  validFrom: string;
  validTo: string | null;
  isActive: boolean;
};

export type InviteUserResponse = {
  ok: true;
  userId: string;
  assignmentId: string;
  tempPassword: string | null;
  alreadyExists: boolean;
};
