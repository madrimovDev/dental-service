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
    quantity: 12,
    minThreshold: 5,
    lowStock: false,
    stockState: 'ok',
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

  it('yetarli item uchun "ok" badge koʻrsatadi', () => {
    renderApp(
      <StockItemsTable
        items={[vm({ id: 'ok1', name: 'Bint', lowStock: false, stockState: 'ok' })]}
        selectedId={null}
        onSelect={() => {}}
        canManage={false}
        onMovement={() => {}}
      />,
    );
    const okLabel = screen.getByText('Yetarli');
    expect(okLabel).toBeTruthy();
    expect(okLabel.closest('[data-status="success"]')).toBeTruthy();
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
});
