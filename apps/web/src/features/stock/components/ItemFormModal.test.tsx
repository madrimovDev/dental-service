import type { Branch } from '@dental/api-client';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../test-utils';
import type { StockItemVM } from '../stock.types';
import { ItemFormModal } from './ItemFormModal';

const updateStockItem = vi.fn();
const createStockItem = vi.fn();
vi.mock('@dental/api-client', async (orig) => ({
  ...(await orig<typeof import('@dental/api-client')>()),
  updateStockItem: (...a: unknown[]) => updateStockItem(...a),
  createStockItem: (...a: unknown[]) => createStockItem(...a),
}));

const item: StockItemVM = {
  id: 'i1',
  branchId: null,
  name: 'Anestetik',
  unit: 'ml',
  category: 'Anesteziya',
  price: 15000,
  quantity: 120,
  minThreshold: 5,
  lowStock: false,
  stockState: 'ok',
  avgDailyUsage: 0,
  daysLeft: null,
  daysState: 'none',
};

beforeEach(() => {
  updateStockItem.mockReset();
  createStockItem.mockReset();
  updateStockItem.mockResolvedValue({ data: {} });
  createStockItem.mockResolvedValue({ data: {} });
});

describe('ItemFormModal — tahrirlash (FX-129)', () => {
  it('edit rejimi: kategoriya/narx/minimal qoldiq to‘ldirilgan; saqlash PATCH chaqiradi, quantity yuborilmaydi', async () => {
    renderApp(<ItemFormModal opened onClose={() => {}} branches={[]} item={item} />);
    const category = (await screen.findByLabelText(/Kategoriya/)) as HTMLInputElement;
    expect(category.value).toBe('Anesteziya');
    expect((screen.getByLabelText(/Narx/) as HTMLInputElement).value).toContain('15');
    expect((screen.getByLabelText(/Minimal qoldiq/) as HTMLInputElement).value).toBe('5');

    fireEvent.change(category, { target: { value: 'Og‘riqsizlantirish' } });
    fireEvent.change(screen.getByLabelText(/Minimal qoldiq/), { target: { value: '9' } });
    fireEvent.click(screen.getByRole('button', { name: 'Saqlash' }));

    await waitFor(() => expect(updateStockItem).toHaveBeenCalledOnce());
    const [id, body] = updateStockItem.mock.calls[0] as [string, Record<string, unknown>];
    expect(id).toBe('i1');
    expect(body).toMatchObject({ category: 'Og‘riqsizlantirish', price: 15000, minThreshold: 9 });
    expect(body).not.toHaveProperty('quantity');
    expect(createStockItem).not.toHaveBeenCalled();
  });

  // FX-129 review: API updateItemSchema `price`ni `z.coerce.number().optional()` deb oladi —
  // `null` coerce bilan 0 ga aylanadi. Shuning uchun bo'sh narx tahrirda UMUMAN yuborilmaydi
  // (narx o'zgarmaydi); narxni tozalab null qilish qo'llab-quvvatlanmaydi.
  it('narxi yo‘q mahsulotni tahrirlash → price yuborilmaydi (0 ga yozilmaydi)', async () => {
    renderApp(
      <ItemFormModal opened onClose={() => {}} branches={[]} item={{ ...item, price: null }} />,
    );
    fireEvent.change(await screen.findByLabelText(/Minimal qoldiq/), { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: 'Saqlash' }));
    await waitFor(() => expect(updateStockItem).toHaveBeenCalledOnce());
    const body = (updateStockItem.mock.calls[0] as [string, Record<string, unknown>])[1];
    expect(body).toMatchObject({ minThreshold: 7 });
    expect(body).not.toHaveProperty('price');
  });

  it('narxni tozalash → price yuborilmaydi (null/0 emas)', async () => {
    renderApp(<ItemFormModal opened onClose={() => {}} branches={[]} item={item} />);
    fireEvent.change(await screen.findByLabelText(/Narx/), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Saqlash' }));
    await waitFor(() => expect(updateStockItem).toHaveBeenCalledOnce());
    expect(updateStockItem.mock.calls[0]?.[1]).not.toHaveProperty('price');
  });

  it('yaratish rejimi: createStockItem (kategoriya/narx bilan), update chaqirilmaydi', async () => {
    renderApp(<ItemFormModal opened onClose={() => {}} branches={[]} item={null} />);
    fireEvent.change(await screen.findByLabelText(/Nomi/), { target: { value: 'Bint' } });
    fireEvent.change(screen.getByLabelText(/Birlik/), { target: { value: 'dona' } });
    fireEvent.change(screen.getByLabelText(/Kategoriya/), { target: { value: 'Sarflanuvchi' } });
    fireEvent.change(screen.getByLabelText(/Narx/), { target: { value: '2000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Saqlash' }));
    await waitFor(() => expect(createStockItem).toHaveBeenCalledOnce());
    expect(createStockItem.mock.calls[0]?.[0]).toMatchObject({
      name: 'Bint',
      category: 'Sarflanuvchi',
      price: 2000,
    });
    expect(updateStockItem).not.toHaveBeenCalled();
  });

  // FX-165: filial tanlanib, keyin tozalansa Mantine Select `null` beradi — zod `undefined`ni
  // kutardi (string|undefined), validatsiya jimgina yiqilib, «Saqlash» hech narsa qilmasdi.
  it('tanlangan filialni tozalash → validatsiya o‘tadi, branchId yuborilmaydi', async () => {
    const branches = [{ id: 'b1', name: 'Markaz' }] as unknown as Branch[];
    renderApp(<ItemFormModal opened onClose={() => {}} branches={branches} item={null} />);
    fireEvent.change(await screen.findByLabelText(/Nomi/), { target: { value: 'Bint' } });
    fireEvent.change(screen.getByLabelText(/Birlik/), { target: { value: 'dona' } });
    const branchInput = screen.getByRole('textbox', { name: 'Filial' });
    fireEvent.click(branchInput);
    fireEvent.click(await screen.findByRole('option', { name: 'Markaz' }));
    await waitFor(() => expect((branchInput as HTMLInputElement).value).toBe('Markaz'));
    const clear = branchInput
      .closest('.mantine-Select-root')
      ?.querySelector('.mantine-InputClearButton-root');
    expect(clear).not.toBeNull();
    fireEvent.click(clear as Element);
    await waitFor(() => expect((branchInput as HTMLInputElement).value).toBe(''));
    fireEvent.click(screen.getByRole('button', { name: 'Saqlash' }));
    await waitFor(() => expect(createStockItem).toHaveBeenCalledOnce());
    expect(createStockItem.mock.calls[0]?.[0]).toMatchObject({ name: 'Bint', unit: 'dona' });
    expect(createStockItem.mock.calls[0]?.[0].branchId).toBeUndefined();
  });
});
