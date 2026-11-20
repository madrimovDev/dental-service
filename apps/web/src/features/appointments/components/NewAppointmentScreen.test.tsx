import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../test-utils';
import { NewAppointmentScreen } from './NewAppointmentScreen';

// FX-110 (LB-19): «Yozish» tugmalari patientId'ni URL'da uzatadi — ekran uni wizardga beradi.
vi.mock('./NewAppointmentWizard', () => ({
  NewAppointmentWizard: ({
    initialPatientId,
    initialDoctorId,
    initialDate,
    initialTime,
  }: {
    initialPatientId?: string;
    initialDoctorId?: string;
    initialDate?: string;
    initialTime?: string;
  }) => (
    <div data-testid="wizard">
      {initialPatientId ?? 'none'}|{initialDoctorId ?? '-'}|{initialDate ?? '-'}|
      {initialTime ?? '-'}
    </div>
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

  it('FT-05.1: ?doctorId&date&time ni wizardga beradi', () => {
    renderApp(<NewAppointmentScreen />, {
      route: '/appointments/new?doctorId=d1&date=2026-06-10&time=09:30',
    });
    expect(screen.getByTestId('wizard')).toHaveTextContent('none|d1|2026-06-10|09:30');
  });
});
