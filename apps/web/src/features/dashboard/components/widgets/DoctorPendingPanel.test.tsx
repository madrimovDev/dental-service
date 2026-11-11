import { describe, expect, it } from 'vitest';
import type { DoctorPending } from '../../doctor.api.ts';
import { buildPendingRows } from './DoctorPendingPanel.tsx';

const item = (n: string) => ({
  id: n,
  patientId: `p-${n}`,
  patientName: n,
  at: '2030-01-01T00:00:00Z',
});
const base: DoctorPending = {
  nextPatient: null,
  unsignedVisitNotes: { count: 0, items: [] },
  unreviewedImages: { count: 0, items: [] },
  plansAwaitingResponse: { count: 0, oldestDays: null, items: [] },
};

describe('buildPendingRows', () => {
  it("bo'sh agregat → qator yo'q", () => {
    expect(
      buildPendingRows(
        base,
        () => 't',
        () => 'x',
      ),
    ).toEqual([]);
  });
  it('faqat count>0 bloklar, birinchi bemorga havola', () => {
    const rows = buildPendingRows(
      {
        ...base,
        unsignedVisitNotes: { count: 2, items: [item('A'), item('B')] },
        plansAwaitingResponse: { count: 1, oldestDays: 9, items: [item('C')] },
      },
      (k, n) => `${k}:${n}`,
      (d) => `${d} kun`,
    );
    expect(rows.map((r) => r.key)).toEqual(['notes', 'plans']);
    expect(rows[0]).toMatchObject({ title: 'notes:2', text: 'A, B', to: '/patients/p-A' });
    expect(rows[1]).toMatchObject({ text: '9 kun', to: '/patients/p-C' });
  });
});
