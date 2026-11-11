import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildVisitNoteBody,
  clearDraft,
  draftKey,
  emptyVisitForm,
  firstUnresolvedRxConflict,
  loadDraft,
  pendingAllergyConflict,
  type RxRow,
  saveDraft,
} from './visit-note-form';

const penicillin = [{ substance: 'Penitsillin' }];
const override = {
  drug: 'Amoksitsillin',
  group: 'penicillin',
  allergen: 'Penitsillin',
  reason: 'patient_informed',
};

describe('buildVisitNoteBody', () => {
  const ctx = { patientId: 'p1', doctorId: 'u1', isEdit: false, overrides: [] };

  it('yaratish: bo‘sh xizmatlar undefined (stock’ga tegilmaydi)', () => {
    expect(buildVisitNoteBody(emptyVisitForm(), ctx).performedServices).toBeUndefined();
  });

  it('tahrir: bo‘sh massiv YUBORILADI (BOM qaytarilishi uchun)', () => {
    expect(
      buildVisitNoteBody(emptyVisitForm(), { ...ctx, isEdit: true }).performedServices,
    ).toEqual([]);
  });

  it('override va keyingi tashrif tanaga tushadi, bo‘shlari tushmaydi', () => {
    const v = { ...emptyVisitForm(), nextVisit: '2w' as const };
    const body = buildVisitNoteBody(v, { ...ctx, overrides: [override] });
    expect(body.allergyOverrides).toEqual([override]);
    expect(body.nextVisit).toBe('2w');
    expect(buildVisitNoteBody(emptyVisitForm(), ctx).allergyOverrides).toBeUndefined();
  });
});

describe('dori ↔ allergiya', () => {
  it('penitsillin allergiyasi + amoksitsillin → to‘qnashuv', () => {
    expect(pendingAllergyConflict('Amoksitsillin 500 mg', penicillin, [])?.group).toBe(
      'penicillin',
    );
  });

  it('sabab bilan tasdiqlangandan keyin shu bemorda qayta so‘ralmaydi', () => {
    expect(pendingAllergyConflict('Amoksitsillin 500 mg', penicillin, [override])).toBeNull();
    // boshqa yozilish (kirill) ham o'sha dori
    expect(pendingAllergyConflict('Амоксициллин', penicillin, [override])).toBeNull();
  });

  it('allergiya bo‘lmasa yoki dori boshqa guruhda — null', () => {
    expect(pendingAllergyConflict('Amoksitsillin', [], [])).toBeNull();
    expect(pendingAllergyConflict('Ibuprofen 400 mg', penicillin, [])).toBeNull();
  });

  it('saqlash qo‘riqchisi: hal qilinmagan birinchi qatorni topadi', () => {
    const rows: RxRow[] = [
      { key: 'a', drug: 'Ibuprofen', dosage: '400 mg', frequency: '1×2', days: 3 },
      { key: 'b', drug: 'Ampitsillin', dosage: '500 mg', frequency: '1×3', days: 5 },
    ];
    expect(firstUnresolvedRxConflict(rows, penicillin, [])?.index).toBe(1);
    expect(
      firstUnresolvedRxConflict(rows, penicillin, [{ ...override, drug: 'Ampitsillin' }]),
    ).toBeNull();
  });
});

describe('avto-qoralama (localStorage)', () => {
  beforeEach(() => localStorage.clear());

  it('saqlaydi, o‘qiydi, tozalaydi', () => {
    const key = draftKey('p1', null);
    const values = { ...emptyVisitForm(), subjective: 'og‘riq' };
    expect(saveDraft(key, { values, rx: [], overrides: [], savedAt: '2026-11-11T10:00:00Z' })).toBe(
      true,
    );
    expect(loadDraft(key)?.values.subjective).toBe('og‘riq');
    clearDraft(key);
    expect(loadDraft(key)).toBeNull();
  });

  it('localStorage yozish xatosi (quota/private) yiqitmaydi', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(
      saveDraft('k', {
        values: emptyVisitForm(),
        rx: [],
        overrides: [],
        savedAt: '2026-11-11T10:00:00Z',
      }),
    ).toBe(false);
    spy.mockRestore();
  });

  it('buzilgan JSON → null (yiqitmaydi)', () => {
    localStorage.setItem('bad', '{nope');
    expect(loadDraft('bad')).toBeNull();
  });
});
