import type { StaffProfile, UserAssignment } from '@dental/db-schema';
import type { StaffProfileDto, UserAssignmentDto, UserAssignmentRowDto } from './users.schema.ts';

// ─── Enriched list row mapper ─────────────────────────────────────────────────

/**
 * Joined list row (Date timestamps) → wire DTO (ISO strings, nullable fields preserved).
 * Matches api-client `UserAssignment` shape.
 */
export type UserAssignmentListRow = {
  assignmentId: string;
  userId: string;
  userEmail: string | null;
  userPhone: string;
  userFullName: string | null;
  branchId: string | null;
  branchName: string | null;
  roleId: string;
  roleName: string;
  validFrom: Date;
  validTo: Date | null;
  isActive: boolean;
  pending: boolean;
};

export const toUserAssignmentDto = (row: UserAssignmentListRow): UserAssignmentDto => ({
  assignmentId: row.assignmentId,
  userId: row.userId,
  userEmail: row.userEmail,
  userPhone: row.userPhone,
  userFullName: row.userFullName,
  branchId: row.branchId,
  branchName: row.branchName,
  roleId: row.roleId,
  roleName: row.roleName,
  validFrom: row.validFrom.toISOString(),
  validTo: row.validTo ? row.validTo.toISOString() : null,
  isActive: row.isActive,
  pending: row.pending,
});

// ─── Raw assignment row mapper ────────────────────────────────────────────────

/**
 * Raw `userAssignments.$inferSelect` (Date timestamps) → wire DTO (ISO strings).
 * Used for addAssignment / updateAssignment responses.
 */
export const toUserAssignmentRowDto = (row: UserAssignment): UserAssignmentRowDto => ({
  id: row.id,
  userId: row.userId,
  tenantId: row.tenantId,
  branchId: row.branchId ?? null,
  roleId: row.roleId,
  validFrom: row.validFrom.toISOString(),
  validTo: row.validTo ? row.validTo.toISOString() : null,
  isActive: row.isActive,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

// ─── Staff profile mapper ─────────────────────────────────────────────────────

/**
 * `staffProfiles.$inferSelect` → wire DTO.
 * `startedAt` is a `date`-mode Drizzle column (string | null), no ISO conversion needed.
 * `baseSalary`/`commissionPercent` are `numeric` (string). Only timestamps need toISOString().
 */
const MASKED_AMOUNT = '0.00';

export const toStaffProfileDto = (
  row: StaffProfile,
  /** FX-130: maosh maydonlari faqat `salary.view` (yoki payroll/owner) bilan ochiladi. */
  includeSalary: boolean,
): StaffProfileDto => ({
  id: row.id,
  tenantId: row.tenantId,
  userId: row.userId,
  specialty: row.specialty ?? null,
  employmentStatus: row.employmentStatus,
  startedAt: row.startedAt ?? null,
  // Niqoblangan qiymat: sxema `string` (kontrakni o'zgartirmaslik uchun), '0.00' = "ko'rsatilmaydi".
  baseSalary: includeSalary ? row.baseSalary : MASKED_AMOUNT,
  commissionPercent: includeSalary ? row.commissionPercent : MASKED_AMOUNT,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});
