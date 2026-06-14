/**
 * Cross-feature lookup query-key factory (RFC-0010 §3).
 *
 * Bu lookup'lar (filiallar, xizmatlar, barcha bemorlar, xodim assignment'lari) bir nechta
 * feature'da bir xil `queryKey` bilan ishlatiladi — cache ATAYLAB bo'lishiladi (bir marta
 * yuklanadi, hamma feature foydalanadi). Shu sabab ular feature-namespace'ga bo'linmaydi:
 * key'lar byte-identical qoladi. Feature-spetsifik key'lar har feature'ning o'z
 * `<feature>.keys.ts` faylida.
 */
export const lookupKeys = {
  branches: () => ['branches'] as const,
  services: () => ['services'] as const,
  patientsAll: () => ['patients', 'list-all'] as const,
  userAssignments: () => ['users', 'assignments'] as const,
};
