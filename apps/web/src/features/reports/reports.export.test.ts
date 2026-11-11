import type {
  AppointmentStatsReport,
  DoctorWorkloadRow,
  PlanCompletionReport,
  RevenueReport,
} from '@dental/api-client';
import { describe, expect, it } from 'vitest';
import {
  appointmentsToRows,
  doctorsToRows,
  neutralizeFormula,
  oneCToRows,
  planCompletionToRows,
  revenueToRows,
  toCsv,
} from './reports.export';

describe('revenueToRows', () => {
  const report: RevenueReport = {
    total: 1500,
    byBranch: [{ branchId: 'b1', total: 1000 }],
    byService: [{ serviceName: 'Plomba', total: 600 }],
    byDoctor: [
      { doctorId: 'd1', total: 900 },
      { doctorId: null, total: 100 },
    ],
    byPeriod: [{ date: '2026-06-01', total: 500 }],
    byPaymentMethod: [],
    comparison: { previous: null, yoy: null },
  };

  it('emits a header section for each grouping', () => {
    const rows = revenueToRows(report);
    const flat = rows.map((r) => r[0]);
    expect(flat).toContain('Daromad hisoboti');
    expect(flat).toContain('Filial bo‘yicha');
    expect(flat).toContain('Xizmat bo‘yicha');
    expect(flat).toContain('Shifokor bo‘yicha');
    expect(flat).toContain('Sana bo‘yicha');
  });

  it('renders the total value', () => {
    const rows = revenueToRows(report);
    expect(rows).toContainEqual(['Jami', '1500']);
  });

  it('renders branch / service / period rows', () => {
    const rows = revenueToRows(report);
    expect(rows).toContainEqual(['b1', '1000']);
    expect(rows).toContainEqual(['Plomba', '600']);
    expect(rows).toContainEqual(['2026-06-01', '500']);
  });

  it('renders a placeholder for a null doctor', () => {
    const rows = revenueToRows(report);
    expect(rows).toContainEqual(['d1', '900']);
    expect(rows).toContainEqual(['—', '100']);
  });
});

describe('appointmentsToRows', () => {
  const report: AppointmentStatsReport = {
    total: 40,
    byStatus: [
      { status: 'completed', count: 30 },
      { status: 'no_show', count: 4 },
    ],
    noShowRate: 0.1,
    slotUtilization: 0.75,
    byPeriod: [],
    comparison: { previous: null, yoy: null },
    occupancy: [],
  };

  it('emits header and summary metrics', () => {
    const rows = appointmentsToRows(report);
    expect(rows[0]).toEqual(['Qabullar statistikasi']);
    expect(rows).toContainEqual(['Jami', '40']);
    expect(rows).toContainEqual(['Kelmaganlar ulushi', '0.1']);
    expect(rows).toContainEqual(['Slot bandligi', '0.75']);
  });

  it('renders one row per status plus the status header', () => {
    const rows = appointmentsToRows(report);
    expect(rows).toContainEqual(['Status', 'Soni']);
    expect(rows).toContainEqual(['completed', '30']);
    expect(rows).toContainEqual(['no_show', '4']);
  });
});

describe('doctorsToRows', () => {
  const data: DoctorWorkloadRow[] = [
    { doctorId: 'd1', total: 10, completed: 8 },
    { doctorId: 'd2', total: 5, completed: 5 },
  ];

  it('emits header rows', () => {
    const rows = doctorsToRows(data);
    expect(rows[0]).toEqual(['Shifokorlar yuklamasi']);
    expect(rows[1]).toEqual(['Shifokor', 'Jami', 'Yakunlangan']);
  });

  it('renders one row per doctor with values', () => {
    const rows = doctorsToRows(data);
    expect(rows).toContainEqual(['d1', '10', '8']);
    expect(rows).toContainEqual(['d2', '5', '5']);
    // 1 sarlavha + 1 ustun sarlavhasi + 2 shifokor
    expect(rows).toHaveLength(4);
  });

  it('handles an empty list (headers only)', () => {
    const rows = doctorsToRows([]);
    expect(rows).toHaveLength(2);
  });
});

describe('planCompletionToRows', () => {
  const report: PlanCompletionReport = {
    totalStages: 20,
    completedStages: 12,
    rate: 0.6,
    byStatus: [
      { status: 'done', count: 12 },
      { status: 'pending', count: 8 },
    ],
  };

  it('emits header and summary metrics', () => {
    const rows = planCompletionToRows(report);
    expect(rows[0]).toEqual(['Davolash rejalari bajarilishi']);
    expect(rows).toContainEqual(['Jami bosqichlar', '20']);
    expect(rows).toContainEqual(['Yakunlangan bosqichlar', '12']);
    expect(rows).toContainEqual(['Bajarilish ulushi', '0.6']);
  });

  it('renders one row per status', () => {
    const rows = planCompletionToRows(report);
    expect(rows).toContainEqual(['Status', 'Soni']);
    expect(rows).toContainEqual(['done', '12']);
    expect(rows).toContainEqual(['pending', '8']);
  });
});

describe('oneCToRows (V3-4)', () => {
  it('1C header + qator (refund manfiy summa)', () => {
    const rows = oneCToRows([
      {
        date: '2026-03-01',
        receiptNumber: 'R-1',
        type: 'payment',
        paymentMethod: 'cash',
        amount: 100000,
        patientName: 'Ali',
      },
      {
        date: '2026-03-02',
        receiptNumber: 'R-1-R1',
        type: 'refund',
        paymentMethod: 'cash',
        amount: -40000,
        patientName: 'Ali',
      },
    ]);
    expect(rows[0]).toEqual(['Дата', 'Документ', 'Тип', 'Метод', 'Сумма', 'Контрагент']);
    expect(rows[1]).toEqual(['2026-03-01', 'R-1', 'payment', 'cash', '100000', 'Ali']);
    expect(rows[2]?.[4]).toBe('-40000');
  });
});

describe('FU-33 CSV formula-injection himoyasi', () => {
  it("=,+,-,@ bilan boshlangan MATN `'` bilan prefikslanadi", () => {
    expect(neutralizeFormula('=HYPERLINK("http://x","y")')).toBe('\'=HYPERLINK("http://x","y")');
    expect(neutralizeFormula('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(neutralizeFormula('-2+3+cmd|calc')).toBe("'-2+3+cmd|calc");
    expect(neutralizeFormula('+cmd|calc')).toBe("'+cmd|calc");
    expect(neutralizeFormula('\t=1+1')).toBe("'\t=1+1");
  });

  it('oddiy matn va sonlar (manfiy summa, telefon) o‘zgarmaydi', () => {
    expect(neutralizeFormula('Ali Valiyev')).toBe('Ali Valiyev');
    expect(neutralizeFormula('-40000')).toBe('-40000');
    expect(neutralizeFormula('+998901234567')).toBe('+998901234567');
    expect(neutralizeFormula('12.5')).toBe('12.5');
    expect(neutralizeFormula('')).toBe('');
  });

  it("toCsv: kontragent nomi formula bo'lsa 1C CSV'da zararsiz, ajratkich/qo'shtirnoq saqlanadi", () => {
    const rows = oneCToRows([
      {
        date: '2026-03-01',
        receiptNumber: 'R-1',
        type: 'payment',
        paymentMethod: 'cash',
        amount: -40000,
        patientName: "=cmd|' /C calc'!A0",
      },
    ]);
    const csv = toCsv(rows, ';');
    const line = csv.split('\r\n')[1] ?? '';
    expect(line).toBe("2026-03-01;R-1;payment;cash;-40000;'=cmd|' /C calc'!A0");
    expect(toCsv([['a;b', '"q"']], ';')).toBe('"a;b";"""q"""');
  });
});
