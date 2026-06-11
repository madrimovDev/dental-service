import type { PermissionDef, UserAssignment } from '@dental/api-client';

/** Resurs (kod prefiksi) bo'yicha guruhlangan permission'lar. */
export type PermissionGroup = {
  /** Kod prefiksi, masalan "patient", "cashier". */
  resource: string;
  permissions: PermissionDef[];
};

/** Users qidiruv/filter parametrlari (sof mapper kirishi). */
export type UsersFilter = {
  search: string;
  branchId: string | null;
  roleId: string | null;
};

export type UserAssignmentVM = UserAssignment;
