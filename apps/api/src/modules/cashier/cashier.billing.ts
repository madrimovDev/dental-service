/**
 * Billing balans hisobi — SOF funksiya (Context/Drizzle YO'Q).
 * Service rowlarni fetch qiladi, keyin shuni chaqiradi.
 * Drizzle numeric → string, shuning uchun string kirish + Number()-parse.
 */

/**
 * Qarzga KIRMAYDIGAN bosqich statuslari (Qaror #24).
 * `Set<string>` — enum bilan ham, kelajakdagi statuslar bilan ham xavfsiz taqqoslash.
 */
const EXCLUDED_FROM_DEBT = new Set<string>(['skipped', 'rejected']);

/** Plan bosqichi (treatment_stages'dan o'qiladi — billing o'zgartirmaydi). */
export type StageRow = {
  id: string;
  serviceName: string;
  cost: string; // numeric → string
  status?: string; // treatment_stage_status — undefined ⇒ qarzga kiradi (fixture'lar uchun)
};

/** Allocation row (treatment_stage_payments). amount ijobiy=to'lov, manfiy=refund. */
export type AllocationRow = {
  stageId: string;
  amount: string; // numeric → string
};

export type StageBalance = {
  stageId: string;
  serviceName: string;
  cost: number;
  paid: number;
  remaining: number;
  /** Qaror #24: bosqich qarzdan chiqarilgan (skipped/rejected) — cost 0, to'lov esa SAQLANADI (kredit). */
  excludedFromDebt: boolean;
};

export type PlanBalance = {
  totalCost: number;
  totalPaid: number;
  balance: number;
  stages: StageBalance[];
};

export function computePlanBalance(stages: StageRow[], allocations: AllocationRow[]): PlanBalance {
  // stage_id bo'yicha allocation yig'indisi (manfiylar refundni negatsiya qiladi)
  const paidByStage = new Map<string, number>();
  for (const a of allocations) {
    paidByStage.set(a.stageId, (paidByStage.get(a.stageId) ?? 0) + Number(a.amount));
  }

  const stageBalances: StageBalance[] = stages.map((s) => {
    const excludedFromDebt = s.status !== undefined && EXCLUDED_FROM_DEBT.has(s.status);
    // Qaror #24: skipped/rejected bosqich cost'i 0, lekin allocation (paid) SAQLANADI.
    // Bosqichni ro'yxatdan O'CHIRMA — allocation orphan bo'lib to'lov yo'qoladi (ghost-tuzoq).
    const cost = excludedFromDebt ? 0 : Number(s.cost);
    const paid = paidByStage.get(s.id) ?? 0;
    return {
      stageId: s.id,
      serviceName: s.serviceName,
      cost,
      paid,
      remaining: cost - paid, // skipped: 0 − paid = manfiy (kredit)
      excludedFromDebt,
    };
  });

  const totalCost = stageBalances.reduce((sum, s) => sum + s.cost, 0);
  const totalPaid = stageBalances.reduce((sum, s) => sum + s.paid, 0);

  return { totalCost, totalPaid, balance: totalCost - totalPaid, stages: stageBalances };
}
