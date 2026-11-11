import { ROLE_TEMPLATES } from '@dental/core';
import type { TFunction } from 'i18next';

const KEY_BY_NAME: ReadonlyMap<string, string> = new Map([
  ...ROLE_TEMPLATES.map((r) => [r.name, r.templateKey] as const),
  ['Owner', 'owner'] as const,
]);

/**
 * Rol nomini ko'rsatish: tizim shablon rollari (DB'da inglizcha `name`) `nav.role_name.<templateKey>`
 * orqali tarjima qilinadi; custom rollar o'z nomi bilan. `isSystem` ma'lum bo'lsa (Role DTO)
 * faqat tizim rollari tarjima qilinadi; ma'lum bo'lmasa (assignment DTO) — nom shablon nomiga teng bo'lsa.
 */
export function roleLabel(name: string, t: TFunction, isSystem?: boolean): string {
  if (isSystem === false) return name;
  const key = KEY_BY_NAME.get(name);
  return key ? t(`nav.role_name.${key}`, { defaultValue: name }) : name;
}

/** Tizim shablon rolining `templateKey`i (nom bo'yicha); custom rol yoki noma'lum — null. */
export function roleTemplateKey(name: string, isSystem?: boolean): string | null {
  if (isSystem === false) return null;
  return KEY_BY_NAME.get(name) ?? null;
}
