import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../test-utils';
import type { CartItem } from '../cashier.types';
import { CartTable } from './CartTable';

function makeItem(over: Partial<CartItem['service']> = {}): CartItem {
  return {
    service: {
      id: 's1',
      nameUz: 'Plomba',
      category: 'Terapiya',
      ...over,
    } as CartItem['service'],
    quantity: 2,
    unitPrice: 50000,
  };
}

describe('CartTable', () => {
  it("bo'sh savat hech narsa render qilmaydi", () => {
    renderApp(<CartTable cart={[]} onUpdate={vi.fn()} onRemove={vi.fn()} />);
    // Bo'sh holatda na header, na row chiqadi.
    expect(screen.queryByText('Plomba')).toBeNull();
    expect(screen.queryByLabelText('Soni')).toBeNull();
  });

  it("nom + kategoriya sub-line ko'rsatadi", () => {
    renderApp(<CartTable cart={[makeItem()]} onUpdate={vi.fn()} onRemove={vi.fn()} />);
    expect(screen.getByText('Plomba')).toBeTruthy();
    expect(screen.getByText('Terapiya')).toBeTruthy();
  });

  it("kategoriya null bo'lsa sub-line yo'q", () => {
    renderApp(
      <CartTable cart={[makeItem({ category: null })]} onUpdate={vi.fn()} onRemove={vi.fn()} />,
    );
    expect(screen.queryByText('Terapiya')).toBeNull();
  });

  it('soni va narx NumberInput tahrirlanadi (onUpdate chaqiriladi)', () => {
    const onUpdate = vi.fn();
    renderApp(<CartTable cart={[makeItem()]} onUpdate={onUpdate} onRemove={vi.fn()} />);
    const qty = screen.getByLabelText('Soni') as HTMLInputElement;
    expect(qty.value).toBe('2');
    fireEvent.change(qty, { target: { value: '3' } });
    expect(onUpdate).toHaveBeenCalledWith('s1', { quantity: 3 });

    const price = screen.getByLabelText('Narx') as HTMLInputElement;
    fireEvent.change(price, { target: { value: '60 000' } });
    expect(onUpdate).toHaveBeenCalledWith('s1', { unitPrice: 60000 });
  });

  it('× remove tugma onRemove ni chaqiradi', () => {
    const onRemove = vi.fn();
    renderApp(<CartTable cart={[makeItem()]} onUpdate={vi.fn()} onRemove={onRemove} />);
    fireEvent.click(screen.getByLabelText("O'chirish"));
    expect(onRemove).toHaveBeenCalledWith('s1');
  });
});
