import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../test-utils';
import type { PendingVisit } from '../cashier.types';
import { PendingVisitsCard } from './PendingVisitsCard';

const visit = (over: Partial<PendingVisit> = {}): PendingVisit => ({
  visitNoteId: 'v1',
  patientId: 'p1',
  patientName: 'Laylo Ismoilova',
  doctorId: 'd1',
  doctorName: 'Karimov',
  signedAt: '2026-11-11T08:00:00Z',
  services: [{ serviceId: 's1', serviceName: 'Konsultatsiya', quantity: 1, unitPrice: '50000' }],
  total: '50000',
  hasUnpriced: false,
  ...over,
});

describe('PendingVisitsCard', () => {
  it('bo‘sh ro‘yxat — bo‘sh holat matni', () => {
    renderApp(<PendingVisitsCard visits={[]} activeVisitId={null} onTake={vi.fn()} />);
    expect(screen.getByText("Imzolangan, to'lanmagan vizit yo'q")).toBeTruthy();
  });

  it('«Kassaga olish» vizitni uzatadi', () => {
    const onTake = vi.fn();
    renderApp(<PendingVisitsCard visits={[visit()]} activeVisitId={null} onTake={onTake} />);
    expect(screen.getByText('Laylo Ismoilova')).toBeTruthy();
    fireEvent.click(screen.getByText('Kassaga olish'));
    expect(onTake).toHaveBeenCalledWith(expect.objectContaining({ visitNoteId: 'v1' }));
  });

  it('narxsiz xizmat — ogohlantirish va tugma o‘chiq', () => {
    renderApp(
      <PendingVisitsCard
        visits={[visit({ hasUnpriced: true })]}
        activeVisitId={null}
        onTake={vi.fn()}
      />,
    );
    expect(screen.getByText(/Narxi belgilanmagan/)).toBeTruthy();
    expect(
      (screen.getByText('Kassaga olish').closest('button') as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});
