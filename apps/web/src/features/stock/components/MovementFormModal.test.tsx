import { ApiError } from '@dental/api-client';
import { notifications } from '@mantine/notifications';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../test-utils';
import { movementFormSchema } from '../stock.schema';
import type { StockItemVM } from '../stock.types';
import { MovementFormModal } from './MovementFormModal';

const createStockMovement = vi.fn();
vi.mock('@dental/api-client', async (orig) => ({
  ...(await orig<typeof import('@dental/api-client')>()),
  createStockMovement: (...a: unknown[]) => createStockMovement(...a),
}));

const item: StockItemVM = {
  id: 'i1',
  branchId: null,
  name: 'Anestetik',
  unit: 'ml',
  category: null,
  price: null,
  quantity: 120,
  minThreshold: 5,
  lowStock: false,
  stockState: 'ok',
  avgDailyUsage: 0,
  daysLeft: null,
  daysState: 'none',
};

beforeEach(() => {
  createStockMovement.mockReset();
  createStockMovement.mockResolvedValue({ data: {} });
});

async function pickAdjustment() {
  fireEvent.click(screen.getByRole('textbox', { name: 'Tur' }));
  fireEvent.click(await screen.findByText('Inventarizatsiya'));
}

describe('movementFormSchema (FX-43)', () => {
  it('adjustment uchun 0 ruxsat (API bilan bir xil), in/out uchun yo‘q', () => {
    const base = { itemId: 'i1', reason: '' };
    expect(movementFormSchema.safeParse({ ...base, type: 'adjustment', quantity: 0 }).success).toBe(
      true,
    );
    expect(movementFormSchema.safeParse({ ...base, type: 'out', quantity: 0 }).success).toBe(false);
    expect(movementFormSchema.safeParse({ ...base, type: 'in', quantity: 0 }).success).toBe(false);
    expect(
      movementFormSchema.safeParse({ ...base, type: 'adjustment', quantity: -1 }).success,
    ).toBe(false);
  });
});

describe('MovementFormModal — inventarizatsiya (FX-43)', () => {
  it('adjustment: «Aniqlangan qoldiq» yorlig‘i, joriy qoldiq ko‘rinadi va boshlang‘ich qiymat shu', async () => {
    renderApp(<MovementFormModal opened onClose={() => {}} item={item} />);
    await pickAdjustment();
    const input = (await screen.findByLabelText(/Aniqlangan qoldiq/)) as HTMLInputElement;
    expect(input.value).toBe('120');
    expect(screen.getByText(/Joriy qoldiq/).textContent).toContain('120');
  });

  it('adjustment: 0 kiritib saqlash mumkin (hammasi tugadi)', async () => {
    renderApp(<MovementFormModal opened onClose={() => {}} item={item} />);
    await pickAdjustment();
    const input = await screen.findByLabelText(/Aniqlangan qoldiq/);
    fireEvent.change(input, { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Saqlash' }));
    await waitFor(() => expect(createStockMovement).toHaveBeenCalledOnce());
    expect(createStockMovement.mock.calls[0]?.[0]).toMatchObject({
      itemId: 'i1',
      type: 'adjustment',
      quantity: 0,
    });
  });

  it('chiqim (out): 0 rad etiladi', async () => {
    renderApp(<MovementFormModal opened onClose={() => {}} item={item} />);
    fireEvent.click(screen.getByRole('textbox', { name: 'Tur' }));
    fireEvent.click(await screen.findByText('Chiqim'));
    fireEvent.change(screen.getByLabelText(/Miqdor/), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Saqlash' }));
    await new Promise((r) => setTimeout(r, 50));
    expect(createStockMovement).not.toHaveBeenCalled();
  });
});

describe('MovementFormModal — 409 stock.insufficient (FX-162)', () => {
  it('inglizcha server matni o‘rniga tarjima qilingan xabar (available/requested bilan) ko‘rsatiladi', async () => {
    const show = vi.spyOn(notifications, 'show').mockImplementation(() => 'x');
    createStockMovement.mockRejectedValue(
      new ApiError('stock.insufficient', 'Insufficient stock for this movement', 409, {
        available: 3,
        requested: 10,
      }),
    );
    renderApp(<MovementFormModal opened onClose={() => {}} item={item} />);
    fireEvent.click(screen.getByRole('textbox', { name: 'Tur' }));
    fireEvent.click(await screen.findByText('Chiqim'));
    fireEvent.change(screen.getByLabelText(/Miqdor/), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Saqlash' }));
    await waitFor(() => expect(show).toHaveBeenCalled());
    const message = String(show.mock.calls[0]?.[0].message);
    expect(message).not.toContain('Insufficient');
    expect(message).toContain('3');
    expect(message).toContain('10');
    show.mockRestore();
  });
});
