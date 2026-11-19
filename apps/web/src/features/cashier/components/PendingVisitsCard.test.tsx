import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { i18n } from '@/lib/i18n.ts';
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
  overdue: false,
  services: [{ serviceId: 's1', serviceName: 'Konsultatsiya', quantity: 1, unitPrice: '50000' }],
  total: '50000',
  hasUnpriced: false,
  ...over,
});

describe('PendingVisitsCard', () => {
  it("FX-174: kechikish sanasi joriy til locale'ida (ru) va matnlar «bugungi» demaydi", async () => {
    const iso = '2026-11-11T08:00:00Z';
    const fmt = (loc: string) =>
      new Date(iso).toLocaleDateString(loc, { timeZone: 'Asia/Tashkent' });
    expect(fmt('ru-RU')).not.toBe(fmt('uz-UZ'));
    const prev = i18n.language;
    await i18n.changeLanguage('ru');
    try {
      renderApp(
        <PendingVisitsCard
          visits={[visit({ overdue: true, signedAt: iso })]}
          activeVisitId={null}
          onTake={vi.fn()}
        />,
      );
      expect(screen.getByTestId('pending-visit-overdue').textContent).toContain(fmt('ru-RU'));
      for (const lng of ['uz', 'ru']) {
        for (const k of ['reception_text', 'hint']) {
          const txt = i18n.t(`cashierHandoff.${k}`, { lng });
          expect(txt).not.toMatch(/bugungi|сегодня/i);
        }
      }
    } finally {
      await i18n.changeLanguage(prev);
    }
  });

  it('FX-17: kechikkan vizit belgilanadi, bugungisi belgilanmaydi', () => {
    renderApp(
      <PendingVisitsCard
        visits={[visit({ visitNoteId: 'old', overdue: true }), visit({ visitNoteId: 'new' })]}
        activeVisitId={null}
        onTake={vi.fn()}
      />,
    );
    expect(screen.getAllByTestId('pending-visit-overdue')).toHaveLength(1);
  });

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
