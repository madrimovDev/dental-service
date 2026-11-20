import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildVisitNoteBody,
  clearDraft,
  draftKey,
  emptyVisitForm,
  firstUnresolvedRxConflict,
  loadDraft,
  overrideKey,
  pendingAllergyConflict,
  pickAppointmentToLink,
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

describe('buildVisitNoteBody — FT-01.4 toothNumbers', () => {
  const ctx = { patientId: 'p1', doctorId: 'u1', isEdit: false, overrides: [] };

  it('yaratish: tishlar tanaga tushadi, bo‘sh bo‘lsa yuborilmaydi', () => {
    const v = { ...emptyVisitForm(), toothNumbers: [16, 17] };
    expect(buildVisitNoteBody(v, ctx).toothNumbers).toEqual([16, 17]);
    expect(buildVisitNoteBody(emptyVisitForm(), ctx).toothNumbers).toBeUndefined();
  });

  it('tahrir: bo‘sh massiv YUBORILADI (tishlarni tozalash)', () => {
    expect(buildVisitNoteBody(emptyVisitForm(), { ...ctx, isEdit: true }).toothNumbers).toEqual([]);
  });

  it('eski qoralama (toothNumbers yo‘q) → bo‘sh massiv bilan tiklanadi', () => {
    const key = draftKey('p-old', null);
    localStorage.setItem(
      key,
      JSON.stringify({ values: { subjective: 'x' }, rx: [], overrides: [], savedAt: 'now' }),
    );
    expect(loadDraft(key)?.values.toothNumbers).toEqual([]);
    clearDraft(key);
  });
});

describe('buildVisitNoteBody — FX-14 completesStage', () => {
  const ctx = { patientId: 'p1', doctorId: 'u1', isEdit: false, overrides: [] };

  it('bosqich tanlanmagan bo‘lsa completesStage yuborilmaydi', () => {
    expect(buildVisitNoteBody(emptyVisitForm(), ctx).completesStage).toBeUndefined();
  });

  it('bosqich bilan: default true; oraliq vizit (false) tanaga tushadi', () => {
    const v = { ...emptyVisitForm(), stageId: 's1' };
    expect(buildVisitNoteBody(v, ctx).completesStage).toBe(true);
    expect(buildVisitNoteBody({ ...v, completesStage: false }, ctx).completesStage).toBe(false);
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

  it('boshqa dori/guruh uchun override amoksitsillin↔penitsillin to‘qnashuvini bostirmaydi', () => {
    const both = [{ substance: 'Penitsillin' }, { substance: 'Aspirin' }];
    const ibu = {
      drug: 'Tab. Ibuprofen 400',
      group: 'nsaid',
      allergen: 'Aspirin',
      reason: 'patient_informed',
    };
    expect(pendingAllergyConflict('Tab. Ibuprofen 400', both, [ibu])).toBeNull();
    for (const d of [
      'Tab. Amoksitsillin 500',
      'Таб. Амоксициллин',
      'Sol. Amoksitsillin',
      'Rp. Amoksitsillin',
    ]) {
      expect(pendingAllergyConflict(d, both, [ibu])?.group).toBe('penicillin');
    }
    // bir xil nom, lekin boshqa guruh/allergen uchun berilgan override ham bostirmaydi
    expect(
      pendingAllergyConflict('Tab. Amoksitsillin 500', both, [{ ...override, group: 'nsaid' }])
        ?.group,
    ).toBe('penicillin');
    expect(
      pendingAllergyConflict('Tab. Amoksitsillin 500', both, [{ ...override, allergen: 'Aspirin' }])
        ?.group,
    ).toBe('penicillin');
  });

  it('overrideKey: prefiks va dozani olib tashlaydi, dori nomini saqlaydi', () => {
    expect(overrideKey('Tab. Amoksitsillin 500 mg')).toBe(overrideKey('Амоксициллин'));
    expect(overrideKey('Tab. Ibuprofen')).not.toBe(overrideKey('Tab. Amoksitsillin 500'));
    expect(overrideKey('500 mg Ibuprofen')).not.toBe(overrideKey('500 mg Amoksitsillin'));
    expect(overrideKey('Tab. 500')).toBe('');
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

describe('pickAppointmentToLink (FX-117)', () => {
  const now = new Date('2026-11-20T12:00:00');
  const mk = (id: string, doctorId: string, iso: string, status = 'completed') => ({
    id,
    doctorId,
    status,
    startTime: iso,
  });
  const appts = [
    mk('other-doc', 'doc-B', '2026-11-20T09:00:00'),
    mk('mine-late', 'doc-A', '2026-11-20T15:00:00', 'scheduled'),
    mk('mine-near', 'doc-A', '2026-11-20T11:30:00'),
    mk('mine-cancelled', 'doc-A', '2026-11-20T12:00:00', 'cancelled'),
    mk('mine-yesterday', 'doc-A', '2026-11-19T17:00:00', 'in_progress'),
  ];

  it("boshqa shifokorning yozilishi tanlanmaydi (bugungi birinchi yozilish bo'lsa ham)", () => {
    expect(pickAppointmentToLink({ appointments: appts, doctorId: 'doc-A', now })).toBe(
      'mine-near',
    );
    expect(
      pickAppointmentToLink({
        appointments: [mk('x', 'doc-B', '2026-11-20T11:00:00')],
        doctorId: 'doc-A',
        now,
      }),
    ).toBeNull();
  });
  it("so'ralgan (o'tgan kun) yozilish — o'zinikiga tegishli bo'lsa tanlanadi", () => {
    expect(
      pickAppointmentToLink({
        appointments: appts,
        doctorId: 'doc-A',
        requestedId: 'mine-yesterday',
        now,
      }),
    ).toBe('mine-yesterday');
  });
  it("so'ralgan yozilish boshqa shifokorniki bo'lsa e'tiborsiz (avto tanlovga qaytadi)", () => {
    expect(
      pickAppointmentToLink({
        appointments: appts,
        doctorId: 'doc-A',
        requestedId: 'other-doc',
        now,
      }),
    ).toBe('mine-near');
  });
  it("allaqachon vizit bog'langan yozilish o'tkazib yuboriladi", () => {
    expect(
      pickAppointmentToLink({
        appointments: appts,
        doctorId: 'doc-A',
        linkedAppointmentIds: ['mine-near'],
        now,
      }),
    ).toBe('mine-late');
  });
});
