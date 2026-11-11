import type { PermissionDef } from '@dental/api-client';
import { OWNER_ONLY_PERMISSIONS } from '@dental/core';

export type RoleCapabilities = {
  /** Rol qila oladigan ishlar (katalogdagi oddiy til tavsifi, yo'q bo'lsa kod). */
  can: string[];
  /** Katalogda bor, lekin rolda yo'q ishlar. */
  cannot: string[];
};

/**
 * Rol kartasi: «qila oladi / qila olmaydi» ro'yxatlari (permission katalogidan).
 * Tavsif tili — `lang` ('ru' bo'lmasa uz).
 */
export function summarizeRole(
  rolePerms: Iterable<string>,
  catalog: PermissionDef[],
  lang: string,
): RoleCapabilities {
  const has = new Set(rolePerms);
  const label = (p: PermissionDef) => (lang === 'ru' ? p.descriptionRu : p.descriptionUz) || p.code;
  const can: string[] = [];
  const cannot: string[] = [];
  for (const p of catalog) {
    (has.has(p.code) ? can : cannot).push(label(p));
  }
  return { can, cannot };
}

/**
 * `assertCanGrant` (apps/api/src/lib/role-escalation.ts) web ko'zgusi: chaqiruvchi
 * rolning barcha ruxsatlariga ega bo'lishi shart (owner-only kodlar e'tiborsiz).
 * Faqat UI maslahati — haqiqiy to'siq serverda (P5).
 */
export function canGrantRole(callerPerms: string[], rolePerms: string[]): boolean {
  if (callerPerms.includes('@owner')) return true;
  const ownerOnly = OWNER_ONLY_PERMISSIONS as readonly string[];
  return rolePerms.every((c) => ownerOnly.includes(c) || callerPerms.includes(c));
}
