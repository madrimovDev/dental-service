/**
 * Bemor balansi — SOF funksiya (Context/Drizzle YO'Q).
 * Service aggregate query'lar yig'indilarni beradi, keyin shuni chaqiradi.
 * planDebt = stageCostSum − allocationSum (accepted/in_progress/completed rejalar).
 * nonPlanBalance = plansiz kassa qoldig'i (payment − paid, plan_id IS NULL, completed).
 * balance > 0 = qarz, < 0 = kredit.
 */
export type PatientBalanceInput = {
  stageCostSum: number;
  allocationSum: number;
  nonPlanRemainder: number;
};

export type PatientBalance = {
  balance: number;
  planDebt: number;
  nonPlanBalance: number;
};

export function computePatientBalance(input: PatientBalanceInput): PatientBalance {
  const planDebt = input.stageCostSum - input.allocationSum;
  const nonPlanBalance = input.nonPlanRemainder;
  return { balance: planDebt + nonPlanBalance, planDebt, nonPlanBalance };
}

/**
 * Non-plan (erkin POS) tranzaksiya qatori — bemor balansi hisobi uchun xom kirish.
 * `refundedSum` — shu qatorga (`parentTransactionId`) ishora qiluvchi barcha
 * `type='refund'` qatorlarning `paidAmount` yig'indisi.
 */
export type NonPlanTransactionRow = {
  totalAmount: number;
  paidAmount: number;
  refundedSum: number;
};

/**
 * Non-plan qoldiq — CLI-448: to'liq refund qilingan qator (refundedSum >= paidAmount)
 * savdo bekor qilingan hisoblanadi, hissasi 0 (avval: refund butunlay chiqarib
 * tashlanardi, qarz o'zgarmasdan qolardi). Non-plan uchun qisman refund server
 * darajasida taqiqlangan (`cashier.service.ts` `non_plan_partial` guard) — shuning
 * uchun amalda `refundedSum` har doim 0 yoki aynan `paidAmount`ga teng, lekin
 * formula umumiy holatda ham to'g'ri ishlaydi (himoya sifatida).
 * CLI-451: overpay (paidAmount > totalAmount) uchun qo'shimcha guard yo'q — natija
 * tabiiy ravishda manfiy (kredit) bo'ladi.
 */
export function computeNonPlanRemainder(rows: NonPlanTransactionRow[]): number {
  return rows.reduce((sum, row) => {
    if (row.refundedSum >= row.paidAmount) return sum;
    return sum + (row.totalAmount - (row.paidAmount - row.refundedSum));
  }, 0);
}
