import { describe, expect, it } from 'vitest';
import { summarizeLabs } from './lab-order.labs';

const order = (o: Record<string, unknown>) => ({
  labName: 'Oq Tish',
  status: 'delivered',
  sentDate: null,
  deliveredDate: null,
  remakeOfId: null,
  ...o,
});

describe('summarizeLabs', () => {
  it('lab nomi bo‘yicha guruhlaydi (katta-kichik harf va bo‘sh joyga befarq), ko‘p buyurtmalisi birinchi', () => {
    const labs = summarizeLabs([
      order({ labName: 'Oq Tish' }),
      order({ labName: ' oq tish ' }),
      order({ labName: 'Dental Lab Pro' }),
    ]);
    expect(labs.map((l) => l.name)).toEqual(['Oq Tish', 'Dental Lab Pro']);
    expect(labs[0]?.count).toBe(2);
  });

  it('o‘rtacha kunni faqat yetkazilgan buyurtmalardan hisoblaydi', () => {
    const labs = summarizeLabs([
      order({ sentDate: '2026-06-01T00:00:00Z', deliveredDate: '2026-06-05T00:00:00Z' }),
      order({ sentDate: '2026-06-01T00:00:00Z', deliveredDate: '2026-06-07T00:00:00Z' }),
      order({ status: 'sent', sentDate: '2026-06-01T00:00:00Z', deliveredDate: null }),
    ]);
    expect(labs[0]?.avgDays).toBe(5);
  });

  it('yetkazilgan buyurtma yo‘q bo‘lsa avgDays null; remake foizi yaxlitlanadi', () => {
    const labs = summarizeLabs([
      order({ status: 'sent' }),
      order({ status: 'sent', remakeOfId: 'x' }),
      order({ status: 'sent' }),
    ]);
    expect(labs[0]?.avgDays).toBeNull();
    expect(labs[0]?.remakePct).toBe(33);
  });

  it('bekor qilingan va bo‘sh nomli buyurtmalarni hisobga olmaydi', () => {
    const labs = summarizeLabs([
      order({ status: 'cancelled' }),
      order({ labName: '   ' }),
      order({ labName: 'A' }),
    ]);
    expect(labs).toHaveLength(1);
    expect(labs[0]?.name).toBe('A');
  });
});
