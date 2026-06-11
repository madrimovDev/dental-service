/**
 * Payroll qator hisobi (sof funksiya — DB/IO yo'q).
 *
 * commissionAmount = attributedRevenue × commissionPercent / 100;
 * total = baseSalary + commissionAmount.
 *
 * `Math.round(revenue * percent) / 100` — natijani 2 kasr aniqlikgacha yaxlitlaydi
 * (percent butun-foiz, masalan 10): 1000000 × 10 = 10000000 / 100 = 100000.
 */
export function computePayrollLine(
  baseSalary: number,
  attributedRevenue: number,
  commissionPercent: number,
): { commissionAmount: number; total: number } {
  const commissionAmount = Math.round(attributedRevenue * commissionPercent) / 100;
  const total = baseSalary + commissionAmount;
  return { commissionAmount, total };
}
