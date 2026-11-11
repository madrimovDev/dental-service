import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../test-utils';
import type { StockItemVM } from '../stock.types';
import { StockItemsTable } from './StockItemsTable';

vi.mock('@/stores/auth-store.ts', () => ({
  useAuthStore: () => ({ hasPermission: () => true }),
}));

function vm(over: Partial<StockItemVM> = {}): StockItemVM {
  return {
    id: 'i1',
    branchId: 'b1',
    name: 'Anesteziya',
    unit: 'ml',
    category: null,
    price: null,
    quantity: 12,
    minThreshold: 5,
    lowStock: false,
    stockState: 'ok',
    avgDailyUsage: 0,
    daysLeft: null,
    daysState: 'none',
    ...over,
  };
}

describe('StockItemsTable', () => {
  it('kam-qoldi item uchun "low" badge koʻrsatadi', () => {
    renderApp(
      <StockItemsTable
        items={[vm({ id: 'low1', name: 'Qoʻlqop', lowStock: true, stockState: 'low' })]}
        selectedId={null}
        onSelect={() => {}}
        canManage={false}
        onMovement={() => {}}
      />,
    );
    // i18n stock.low = "Kam qoldi"; rendered via @dental/ui StatusPill (status="danger")
    const lowLabel = screen.getByText('Kam qoldi');
    expect(lowLabel).toBeTruthy();
    expect(lowLabel.closest('[data-status="danger"]')).toBeTruthy();
    expect(screen.getByText('Qoʻlqop')).toBeTruthy();
  });

  it('yetarli item uchun "kam qoldi" badge CHIQMAYDI (yangi dizayn: faqat kam-qoldi belgilanadi)', () => {
    renderApp(
      <StockItemsTable
        items={[vm({ id: 'ok1', name: 'Bint', lowStock: false, stockState: 'ok' })]}
        selectedId={null}
        onSelect={() => {}}
        canManage={false}
        onMovement={() => {}}
      />,
    );
    expect(screen.getByText('Bint')).toBeTruthy();
    expect(screen.queryByText('Kam qoldi')).toBeNull();
  });

  it('boʻsh roʻyxatda empty matn', () => {
    renderApp(
      <StockItemsTable
        items={[]}
        selectedId={null}
        onSelect={() => {}}
        canManage={false}
        onMovement={() => {}}
      />,
    );
    expect(screen.getByText("Ombor bo'sh")).toBeTruthy();
  });

  it('sarfi yo‘q (daysLeft=null) → «—», bo‘linish/NaN yo‘q', () => {
    renderApp(
      <StockItemsTable
        items={[vm({ name: 'Bint', daysLeft: null, daysState: 'none' })]}
        selectedId={null}
        onSelect={() => {}}
        canManage={false}
        onMovement={() => {}}
      />,
    );
    expect(screen.getByTitle("Oxirgi 30 kunda sarf yo'q")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/NaN|Infinity/);
  });

  it('kritik (≤5 kun) → «tugayapti» yozuvi va «Kirim» tugmasi; xizmatlar ro‘yxati', () => {
    const onReceive = vi.fn();
    renderApp(
      <StockItemsTable
        items={[vm({ id: 'k1', name: 'Kompozit', daysLeft: 3, daysState: 'critical' })]}
        servicesByItem={new Map([['k1', ['Plomba', 'Restavratsiya', 'Kanal']]])}
        selectedId={null}
        onSelect={() => {}}
        canManage={true}
        onMovement={() => {}}
        onReceive={onReceive}
      />,
    );
    expect(screen.getByText('3 kun · tugayapti')).toBeTruthy();
    expect(screen.getByText(/Plomba, Restavratsiya \+1/)).toBeTruthy();
    screen.getByRole('button', { name: 'Kirim' }).click();
    expect(onReceive).toHaveBeenCalledOnce();
  });

  it('yetarli (>14 kun) → oddiy «N kun», «Kirim» emas «Tarix»', () => {
    renderApp(
      <StockItemsTable
        items={[vm({ name: 'Gutapercha', daysLeft: 55, daysState: 'ok' })]}
        selectedId={null}
        onSelect={() => {}}
        canManage={true}
        onMovement={() => {}}
        onReceive={() => {}}
      />,
    );
    expect(screen.getByText('55 kun')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tarix' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Kirim' })).toBeNull();
  });
});
