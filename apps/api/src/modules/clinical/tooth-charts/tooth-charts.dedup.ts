import type { toothStates } from '@dental/db-schema';

/**
 * CLI-439 B6 — odontogram bir tishda bir nechta surface-state'ni collapse qilish
 * (round-trip data loss) uchun app-level dedup. DB unique constraint
 * `(chart, tooth, surface)` alohida migratsiya + `packages/db-schema` o'zgarishi
 * talab qiladi — scope tashqarisida qoldirilgan (WEB/DB-schema handoff).
 *
 * Bir xil (toothNumber, surface) kombinatsiyasi array'da bir necha marta uchrasa —
 * OXIRGISI saqlanadi (form draft'da keyingi tahrir avvalgisini almashtiradi degan
 * intuitiv semantika). SOF funksiya (Context/DB import YO'Q) — DB'siz test qilinadi.
 */
export function dedupeByToothSurface(
  states: (typeof toothStates.$inferInsert)[],
): (typeof toothStates.$inferInsert)[] {
  const byKey = new Map<string, typeof toothStates.$inferInsert>();
  for (const s of states) {
    byKey.set(`${s.toothNumber}:${s.surface ?? 'whole'}`, s);
  }
  return [...byKey.values()];
}
