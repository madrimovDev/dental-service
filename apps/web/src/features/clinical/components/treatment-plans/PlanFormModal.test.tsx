import { act, fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../../test-utils';
import { PlanFormModal } from './PlanFormModal';

vi.mock('../../clinical.api', () => ({
  useServiceCatalog: () => ({ data: [] }),
  fetchServicePrices: vi.fn(),
}));
vi.mock('@/stores/auth-store.ts', () => ({
  // biome-ignore lint/suspicious/noExplicitAny: test mock selector
  useAuthStore: (sel?: (s: any) => unknown) => {
    const store = { activeBranchId: 'b1' };
    return sel ? sel(store) : store;
  },
}));

// B7 (CLI-439): create muvaffaqiyatidan keyin faqat `close()` chaqirilardi, `form.reset()`
// emas — modal PlanCard qatoridagi `TreatmentPlansTab`da SHARTSIZ mount qilingan
// (`{user && <PlanFormModal .../>}`, `opened` faqat ko'rinishni boshqaradi), shuning
// uchun `useForm` holati oldingi ochilishdan qolib ketardi → tasodifiy dublikat submit.
describe('PlanFormModal (B7 — CLI-439)', () => {
  it("muvaffaqiyatli create'dan keyin forma bo'sh qaytadi (dublikat submit oldi olinadi)", () => {
    const onCreate = vi.fn();
    const onClose = vi.fn();
    renderApp(
      <PlanFormModal
        opened
        onClose={onClose}
        patientId="p1"
        doctorId="d1"
        onCreate={onCreate}
        pending={false}
      />,
    );

    // `required` TextInput label'iga aria-hidden yulduzcha qo'shadi ("Reja nomi *"),
    // shuning uchun aniq mos kelish emas — prefiks bo'yicha qidiriladi.
    const titleLabel = /^Reja nomi/;
    fireEvent.change(screen.getByLabelText(titleLabel), { target: { value: 'Reja X' } });
    fireEvent.click(screen.getByRole('button', { name: "Bosqich qo'shish" }));
    fireEvent.change(screen.getByLabelText('Xizmat nomi'), { target: { value: 'Tozalash' } });
    fireEvent.click(screen.getByRole('button', { name: 'Rejani saqlash' }));

    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Reja X' }),
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );

    // Backend muvaffaqiyatli javob bergan deb faraz — mutation onSuccess'ini
    // (TreatmentPlansTab `createMut.mutate(body, callbacks)` orqali) simulyatsiya qilamiz.
    // `form.reset()` React holatini yangilaydi — act() ichida chaqirilmasa
    // assert'gacha render flush bo'lmaydi.
    act(() => {
      onCreate.mock.calls[0]?.[1]?.onSuccess();
    });

    expect((screen.getByLabelText(titleLabel) as HTMLInputElement).value).toBe('');
    expect(onClose).toHaveBeenCalled();
  });
});
