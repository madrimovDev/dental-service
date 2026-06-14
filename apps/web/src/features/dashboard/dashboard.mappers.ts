// DTO → view-model transformatsiyalar (RFC-0010 §1) — `select:` da ishlatiladi.
// Generic, shu sabab chaqiruvchining element tiplari saqlanadi (faqat kerakli maydon talab qilinadi).

/** Faol lab buyurtmalar — delivered/cancelled holatlari chiqarib tashlanadi. */
export function filterActiveLabOrders<T extends { status: string }>(orders: T[]): T[] {
  return orders.filter((o) => o.status !== 'delivered' && o.status !== 'cancelled');
}

/** Filial id → nom xaritasi (UUID o'rniga nom ko'rsatish uchun). */
export function toBranchNameMap<T extends { id: string; name: string }>(
  rows: T[],
): Map<string, string> {
  return new Map(rows.map((b) => [b.id, b.name]));
}

/** Doktor (userId) → ism xaritasi; ism yo'q bo'lsa telefon. */
export function toDoctorNameMap<
  T extends { userId: string; userFullName?: string | null; userPhone: string },
>(rows: T[]): Map<string, string> {
  return new Map(rows.map((a) => [a.userId, a.userFullName ?? a.userPhone]));
}
