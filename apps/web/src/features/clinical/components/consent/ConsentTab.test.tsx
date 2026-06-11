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
});
