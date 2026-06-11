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
