import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../../test-utils';
import { ConsentTab } from './ConsentTab';

const signMutate = vi.fn();
vi.mock('../../clinical.api', () => ({
  useConsentForms: () => ({ data: [], isLoading: false }),
  useConsentTemplates: () => ({
    data: [
      {
        id: 'tpl1',
        type: 'treatment',
        title: 'Shablon',
        bodyUz: 'UZ matn juda uzun',
        bodyRu: null,
      },
    ],
  }),
  useSignConsent: () => ({ mutate: signMutate, isPending: false }),
  useCreateConsentTemplate: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/stores/auth-store.ts', () => ({
  useAuthStore: () => ({ hasPermission: () => true }),
}));

describe('ConsentTab', () => {
  it('imzolash modalini ochadi', async () => {
    renderApp(<ConsentTab patientId="p1" />);
    // consent.sign_new = "Yangi konsent imzolash"
    fireEvent.click(screen.getByText('Yangi konsent imzolash'));
    // consent.select_template = "Shablon tanlang" (modal portal — async)
    expect(await screen.findByText('Shablon tanlang')).toBeInTheDocument();
  });

  // Characterization: sign submit hozirgi payload shaklini saqlaydi (CLI-117 refactor guard).
  it("sign form submit → signConsent to'g'ri shape bilan", async () => {
    signMutate.mockClear();
    renderApp(<ConsentTab patientId="p1" />);
    fireEvent.click(screen.getByText('Yangi konsent imzolash'));
    // consent.template_title = "Shablon nomi", consent.body_text = "Matn (snapshot)"
    fireEvent.change(await screen.findByLabelText(/Shablon nomi/), {
      target: { value: 'Konsent A' },
    });
    fireEvent.change(screen.getByLabelText(/Matn/), {
      target: { value: 'Yetarlicha uzun matn' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Imzolash' }));
    expect(signMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        patientId: 'p1',
        type: 'treatment',
        title: 'Konsent A',
        bodyText: 'Yetarlicha uzun matn',
        language: 'uz',
      }),
      expect.anything(),
    );
  });
});
