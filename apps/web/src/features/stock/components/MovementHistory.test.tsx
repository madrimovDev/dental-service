import type { StockMovement } from '@dental/api-client';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../test-utils';
import { MovementHistory } from './MovementHistory';

const mv = (over: Partial<StockMovement>): StockMovement =>
  ({
    id: 'm1',
    itemId: 'i1',
    type: 'in',
    quantity: '10',
    reason: null,
    sourceVisitNoteId: null,
    createdAt: '2026-11-20T08:05:00.000Z',
    ...over,
  }) as StockMovement;

describe('MovementHistory (FX-168)', () => {
  it('xom sabab kodlari tarjima qilinadi; erkin matn o‘zgarmaydi', () => {
    renderApp(
      <MovementHistory
        itemName="Anestetik"
        movements={[
          mv({ id: 'a', reason: 'initial_balance' }),
          mv({ id: 'b', reason: 'batch_received' }),
          mv({ id: 'c', reason: 'visit_auto' }),
          mv({ id: 'd', reason: 'visit_edit_return', type: 'in' }),
          mv({ id: 'e', reason: 'Qo‘lda tuzatish' }),
        ]}
      />,
    );
    for (const raw of ['initial_balance', 'batch_received', 'visit_auto', 'visit_edit_return']) {
      expect(screen.queryByText(raw)).toBeNull();
    }
    expect(screen.getByText("Boshlang'ich qoldiq")).toBeTruthy();
    expect(screen.getByText('Qo‘lda tuzatish')).toBeTruthy();
  });

  it('sana vaqt bilan va Asia/Tashkent (UTC+5) bo‘yicha ko‘rsatiladi', () => {
    renderApp(
      <MovementHistory
        itemName="Anestetik"
        movements={[mv({ createdAt: '2026-11-20T20:30:00.000Z' })]}
      />,
    );
    // 20:30Z → Toshkentda 21-noyabr 01:30
    expect(screen.getByText('21.11.2026 01:30')).toBeTruthy();
  });

  it('«Ko‘proq yuklash» faqat hasMore bo‘lganda chiqadi va onLoadMore chaqiradi', () => {
    const onLoadMore = vi.fn();
    const { unmount } = renderApp(
      <MovementHistory itemName="X" movements={[mv({})]} hasMore={false} onLoadMore={onLoadMore} />,
    );
    expect(screen.queryByRole('button', { name: /Ko'proq yuklash/ })).toBeNull();
    unmount();
    renderApp(
      <MovementHistory itemName="X" movements={[mv({})]} hasMore onLoadMore={onLoadMore} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Ko'proq yuklash/ }));
    expect(onLoadMore).toHaveBeenCalledOnce();
  });
});
