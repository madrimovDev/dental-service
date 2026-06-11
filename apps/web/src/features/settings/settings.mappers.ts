import type { PermissionDef, UserAssignment } from '@dental/api-client';
import type { PermissionGroup, UsersFilter } from './settings.types';

/**
 * Permission'larni kod PREFIKSI bo'yicha guruhlaydi (`code.split('.')[0]`).
 * Guruhlar resurs nomi bo'yicha alfabit; har guruh ichida code bo'yicha alfabit.
 * Sof funksiya — barqaror tartib (flaky emas).
 */
export function groupPermissionsByResource(perms: PermissionDef[]): PermissionGroup[] {
  const byResource = new Map<string, PermissionDef[]>();
  for (const p of perms) {
    const resource = p.code.split('.')[0] ?? p.code;
    const list = byResource.get(resource);
    if (list) list.push(p);
    else byResource.set(resource, [p]);
  }
  return [...byResource.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([resource, permissions]) => ({
      resource,
      permissions: [...permissions].sort((a, b) => a.code.localeCompare(b.code)),
    }));
}

/** Assignments'ni qidiruv (ism/telefon) + branch + rol bo'yicha filtrlaydi. Sof funksiya. */
export function filterAssignments(
  assignments: UserAssignment[],
  filter: UsersFilter,
): UserAssignment[] {
  const q = filter.search.trim().toLowerCase();
  return assignments.filter((a) => {
    if (q) {
      const name = (a.userFullName ?? '').toLowerCase();
      const phone = a.userPhone.toLowerCase();
      if (!name.includes(q) && !phone.includes(q)) return false;
    }
    if (filter.branchId && a.branchId !== filter.branchId) return false;
    if (filter.roleId && a.roleId !== filter.roleId) return false;
    return true;
  });
}
