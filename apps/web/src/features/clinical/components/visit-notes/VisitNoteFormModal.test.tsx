import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../../test-utils';
import { VisitNoteFormModal } from './VisitNoteFormModal';

const diagnoses = [
  {
    id: 'd1',
    code: 'K02.1',
    nameUz: 'Kariyes',
    nameRu: 'Кариес',
    category: null,
    descriptionUz: null,
    descriptionRu: null,
  },
];
const appointments = [{ id: 'a1', startTime: '2026-06-11T05:00:00Z' }];
const services = [
  { value: 's1', label: 'C01 — Konsultatsiya' },
  { value: 's2', label: 'C02 — Plomba' },
];

describe('VisitNoteFormModal', () => {
  it('appointmentsiz: createVisitNote appointmentId undefined bilan', () => {
    const onCreate = vi.fn();
    renderApp(
      <VisitNoteFormModal
        opened
        onClose={vi.fn()}
        patientId="p1"
        doctorId="u1"
        diagnoses={diagnoses}
        appointments={appointments}
        services={services}
        pending={false}
        stages={[]}
        onSubmit={onCreate}
      />,
    );
    fireEvent.click(screen.getByText(/Saqlash|Saqla/i));
    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({ patientId: 'p1', doctorId: 'u1', appointmentId: undefined }),
    );
  });

  // CLI-414: xizmat tanlanmaganda performedServices undefined (stock'ga tegilmaydi).
  it('xizmatsiz submit: performedServices undefined', () => {
    const onCreate = vi.fn();
    renderApp(
      <VisitNoteFormModal
        opened
        onClose={vi.fn()}
        patientId="p1"
        doctorId="u1"
        diagnoses={diagnoses}
        appointments={appointments}
        services={services}
        pending={false}
        stages={[]}
        onSubmit={onCreate}
      />,
    );
    fireEvent.click(screen.getByText(/Saqlash|Saqla/i));
    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({ performedServices: undefined }),
    );
  });
});
