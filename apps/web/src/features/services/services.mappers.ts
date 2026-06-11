import type { Service } from '@dental/api-client';
import type { CategoryGroup, ServiceVM } from './services.types';

export function toServiceVM(s: Service): ServiceVM {
  return {
    id: s.id,
    code: s.code,
    nameUz: s.nameUz,
    nameRu: s.nameRu,
    category: s.category,
    durationMinutes: s.durationMinutes,
    isActive: s.isActive,
  };
}

/** Nom (uz/ru) yoki kod bo'yicha case-insensitive qidiruv + kategoriya filter (sof). */
export function filterServices(
  list: Service[],
  search: string,
  category: string | null,
): Service[] {
  const q = search.trim().toLowerCase();
  return list.filter((s) => {
    if (category !== null && s.category !== category) return false;
    if (!q) return true;
    return (
      s.nameUz.toLowerCase().includes(q) ||
      (s.nameRu?.toLowerCase().includes(q) ?? false) ||
      s.code.toLowerCase().includes(q)
    );
  });
}

/**
 * Kategoriya bo'yicha guruhlash. Kategoriyalar alifbo tartibida,
 * kategoriyasiz (null) guruh oxirida. Guruh ichida kirish tartibi saqlanadi.
 */
export function groupByCategory(list: Service[]): CategoryGroup[] {
  const byCategory = new Map<string | null, ServiceVM[]>();
  for (const s of list) {
    const key = s.category;
    const bucket = byCategory.get(key);
    if (bucket) bucket.push(toServiceVM(s));
    else byCategory.set(key, [toServiceVM(s)]);
  }

  const named = [...byCategory.keys()]
    .filter((k): k is string => k !== null)
    .sort((a, b) => a.localeCompare(b));
  const ordered: (string | null)[] = byCategory.has(null) ? [...named, null] : named;

  return ordered.map((category) => ({
    category,
    services: byCategory.get(category) ?? [],
  }));
}
