import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../test-utils';
import { NewAppointmentScreen } from './NewAppointmentScreen';

// FX-110 (LB-19): «Yozish» tugmalari patientId'ni URL'da uzatadi — ekran uni wizardga beradi.
vi.mock('./NewAppointmentWizard', () => ({
  NewAppointmentWizard: ({ initialPatientId }: { initialPatientId?: string }) => (
    <div data-testid="wizard">{initialPatientId ?? 'none'}</div>
  ),
}));

describe('NewAppointmentScreen', () => {
  it('?patientId=… ni wizardga initialPatientId sifatida beradi', () => {
    renderApp(<NewAppointmentScreen />, { route: '/appointments/new?patientId=p-123' });
    expect(screen.getByTestId('wizard')).toHaveTextContent('p-123');
  });

  it("patientId yo'q — initialPatientId berilmaydi", () => {
    renderApp(<NewAppointmentScreen />, { route: '/appointments/new' });
    expect(screen.getByTestId('wizard')).toHaveTextContent('none');
  });
});
