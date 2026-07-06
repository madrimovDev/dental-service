/**
 * Payroll qator hisobi (sof funksiya — DB/IO yo'q).
 *
 * commissionAmount = attributedRevenue × commissionPercent / 100;
 * total = baseSalary + commissionAmount.
 *
 * `Math.round(revenue * percent) / 100` — natijani 2 kasr aniqlikgacha yaxlitlaydi
 * (percent butun-foiz, masalan 10): 1000000 × 10 = 10000000 / 100 = 100000.
 *
 * CLI-446: `attributedRevenue` og'ir refund davrida manfiy bo'lishi mumkin (refund >
 * sotuv). Xom komissiya/total manfiy chiqishi biznes ma'nosiz (xodim "qarzdor"
 * bo'lmaydi) — ikkalasi ham 0'da floor qilinadi.
 */
export function computePayrollLine(
  baseSalary: number,
  attributedRevenue: number,
  commissionPercent: number,
): { commissionAmount: number; total: number } {
  const rawCommission = Math.round(attributedRevenue * commissionPercent) / 100;
  const commissionAmount = Math.max(0, rawCommission);
  const total = Math.max(0, baseSalary + commissionAmount);
  return { commissionAmount, total };
}
