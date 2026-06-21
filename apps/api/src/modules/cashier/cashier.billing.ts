/**
 * Billing balans hisobi — SOF funksiya (Context/Drizzle YO'Q).
 * Service rowlarni fetch qiladi, keyin shuni chaqiradi.
 * Drizzle numeric → string, shuning uchun string kirish + Number()-parse.
 */

/**
 * Qarzga KIRMAYDIGAN bosqich EXECUTION statuslari (Qaror #24).
 * Faqat `status` o'qiga tegishli (acceptance ALOHIDA o'qda — pastga qarang).
 * `Set<string>` — enum bilan ham, kelajakdagi statuslar bilan ham xavfsiz taqqoslash.
 */
const EXCLUDED_STATUS_FROM_DEBT = new Set<string>(['skipped']);

/**
 * Qarzga KIRUVCHI reja statuslari (Qaror #24/C4). Plan shu holatda BO'LMASA — butun
 * reja qarz cost'i 0 (lekin allocation HAMON saqlanadi → kredit). draft/presented/
 * cancelled chiqariladi.
 */
const DEBT_PLAN_STATUSES = new Set<string>(['accepted', 'in_progress', 'completed']);

/** Plan bosqichi (treatment_stages'dan o'qiladi — billing o'zgartirmaydi). */
export type StageRow = {
  id: string;
  serviceName: string;
  cost: string; // numeric → string
  status?: string; // treatment_stage_status — undefined ⇒ qarzga kiradi (fixture'lar uchun)
  /**
   * treatment_stage_acceptance (Qaror #25). ASIMMETRIYA: undefined ⇒ qarzga KIRADI
   * (M9/eski fixture'lar buzilmaydi). Ishlab chiqarishda doim haqiqiy enum qiymat
   * keladi; faqat 'accepted' qarz cost'iga kiradi.
   */
  acceptance?: string;
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
  /**
   * Qaror #24: bosqich qarzdan chiqarilgan — cost 0, to'lov esa SAQLANADI (kredit).
   * Sabablar: status='skipped', acceptance≠'accepted', YOKI plan status qarzga kirmaydi.
   */
  excludedFromDebt: boolean;
};

export type PlanBalance = {
  totalCost: number;
  totalPaid: number;
  balance: number;
  stages: StageBalance[];
};

/**
 * C4 qarz predikati (HAR JOYDA bir xil — patients.service bilan mos bo'lishi SHART):
 *   planDebtCost = Σ stage.cost
 *     WHERE planStatus ∈ {accepted,in_progress,completed}   (undefined ⇒ kiradi)
 *       AND stage.acceptance = 'accepted'                   (undefined ⇒ kiradi)
 *       AND stage.status != 'skipped'                       (undefined ⇒ kiradi)
 * Allocation (paid) HECH QACHON filtrlanmaydi → exclude bo'lgan, lekin to'langan
 * bosqich manfiy (kredit) balans beradi (ghost-allocation tuzog'idan saqlaydi).
 *
 * @param planStatus — ixtiyoriy; undefined bo'lsa plan-darajali filtr O'TKAZILMAYDI
 *   (per-plan chaqiruvda berilib, qarzga kirmaydigan rejada butun cost'ni 0 qiladi).
 */
export function computePlanBalance(
  stages: StageRow[],
  allocations: AllocationRow[],
  planStatus?: string,
): PlanBalance {
  // stage_id bo'yicha allocation yig'indisi (manfiylar refundni negatsiya qiladi)
  const paidByStage = new Map<string, number>();
  for (const a of allocations) {
    paidByStage.set(a.stageId, (paidByStage.get(a.stageId) ?? 0) + Number(a.amount));
  }

  // Plan-darajali filtr: status berilgan VA qarzga kirmaydigan bo'lsa → butun reja exclude.
  const planExcluded = planStatus !== undefined && !DEBT_PLAN_STATUSES.has(planStatus);

  const stageBalances: StageBalance[] = stages.map((s) => {
    const statusExcluded = s.status !== undefined && EXCLUDED_STATUS_FROM_DEBT.has(s.status);
    // acceptance: undefined ⇒ kiradi; aks holda faqat 'accepted' kiradi.
    const acceptanceExcluded = s.acceptance !== undefined && s.acceptance !== 'accepted';
    const excludedFromDebt = planExcluded || statusExcluded || acceptanceExcluded;
    // Qaror #24: exclude bosqich cost'i 0, lekin allocation (paid) SAQLANADI.
    const cost = excludedFromDebt ? 0 : Number(s.cost);
    const paid = paidByStage.get(s.id) ?? 0;
    return {
      stageId: s.id,
      serviceName: s.serviceName,
      cost,
      paid,
      remaining: cost - paid, // exclude: 0 − paid = manfiy (kredit)
      excludedFromDebt,
    };
  });

  const totalCost = stageBalances.reduce((sum, s) => sum + s.cost, 0);
  const totalPaid = stageBalances.reduce((sum, s) => sum + s.paid, 0);

  return { totalCost, totalPaid, balance: totalCost - totalPaid, stages: stageBalances };
}
