import type { DailySummary } from '@dental/api-client';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../../../test-utils';
import { DailySummaryCard } from './DailySummaryCard';

const emptySummary: DailySummary = {
  date: '2026-06-22',
  branchId: 'b1',
  breakdown: [],
};

const summary: DailySummary = {
  date: '2026-06-22',
  branchId: 'b1',
  breakdown: [
    { paymentMethod: 'cash', type: 'payment', total: '300000', count: 3 },
    { paymentMethod: 'card', type: 'payment', total: '100000', count: 1 },
    { paymentMethod: 'cash', type: 'refund', total: '50000', count: 1 },
  ],
};

describe('DailySummaryCard', () => {
  it("bo'sh holatda \"operatsiyalar yo'q\" ko'rsatadi", () => {
    renderApp(<DailySummaryCard summary={emptySummary} />);
    expect(screen.getByText("Bugun operatsiyalar yo'q")).toBeTruthy();
  });

  // CLI-419: backend endi `SUM(paidAmount)` qaytaradi va frontend refundni
  // e'tiborsiz qoldirmaydi — jami tushum SOF (Σ payment − Σ refund).
  it('jami tushum (sof, refund ayirilgan) formatCurrency bilan', () => {
    renderApp(<DailySummaryCard summary={summary} />);
    // (300000 + 100000) - 50000 = 350000.
    expect(screen.getByText("350 000 so'm")).toBeTruthy();
  });

  it("naqd/karta stat box — HAR METOD bo'yicha sof (payment − refund) summasi", () => {
    renderApp(<DailySummaryCard summary={summary} />);
    expect(screen.getByText('Naqd pul')).toBeTruthy();
    expect(screen.getByText('Karta')).toBeTruthy();
    // cash: 300000 - 50000 (refund) = 250000; card: 100000 - 0 = 100000.
    expect(screen.getByText("250 000 so'm")).toBeTruthy();
    expect(screen.getByText("100 000 so'm")).toBeTruthy();
    // 250000/350000 ≈ 71%, 100000/350000 ≈ 29%.
    expect(screen.getByText('71%')).toBeTruthy();
    expect(screen.getByText('29%')).toBeTruthy();
  });

  // CLI-419: refund mavjud bo'lsa ko'rinadigan kassa-chiqim qatori.
  it("refund mavjud bo'lsa ko'rinadigan kassa-chiqim qatori ko'rsatiladi", () => {
    renderApp(<DailySummaryCard summary={summary} />);
    expect(screen.getByText(/naqd chiqim/i)).toBeTruthy();
    expect(screen.getByText("−50 000 so'm")).toBeTruthy();
  });

  it("refund yo'q kunda kassa-chiqim qatori ko'rinmaydi", () => {
    const noRefundSummary: DailySummary = {
      date: '2026-06-22',
      branchId: 'b1',
      breakdown: [
        { paymentMethod: 'cash', type: 'payment', total: '300000', count: 3 },
        { paymentMethod: 'card', type: 'payment', total: '100000', count: 1 },
      ],
    };
    renderApp(<DailySummaryCard summary={noRefundSummary} />);
    expect(screen.queryByText(/naqd chiqim/i)).not.toBeInTheDocument();
  });
});
