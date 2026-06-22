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

  it("jami tushum (faqat to'lovlar, gross) formatCurrency bilan", () => {
    renderApp(<DailySummaryCard summary={summary} />);
    // 300000 + 100000 = 400000 (refund hisobga olinmaydi).
    expect(screen.getByText("400 000 so'm")).toBeTruthy();
  });

  it('naqd/karta stat box ulushi va summasi', () => {
    renderApp(<DailySummaryCard summary={summary} />);
    expect(screen.getByText('Naqd pul')).toBeTruthy();
    expect(screen.getByText('Karta')).toBeTruthy();
    expect(screen.getByText("300 000 so'm")).toBeTruthy();
    expect(screen.getByText("100 000 so'm")).toBeTruthy();
    // 300000/400000 = 75%, 100000/400000 = 25%.
    expect(screen.getByText('75%')).toBeTruthy();
    expect(screen.getByText('25%')).toBeTruthy();
  });
});
