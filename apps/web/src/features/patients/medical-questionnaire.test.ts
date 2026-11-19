import { describe, expect, it } from 'vitest';
import { applyQuestionnaire, isNegativeAnswer } from './medical-questionnaire';

const empty = { anamnez: '', chronicConditionsText: '', currentMedicationsText: '', allergies: [] };

describe('FX-28 applyQuestionnaire', () => {
  it('inkor javoblarni o‘tkazib yuboradi', () => {
    expect(isNegativeAnswer('yo‘q')).toBe(true);
    expect(isNegativeAnswer('Нет.')).toBe(true);
    expect(isNegativeAnswer('penitsillin')).toBe(false);
    const out = applyQuestionnaire({ allergies: 'yo‘q', chronic: "yo'q", medications: '' }, empty);
    expect(out).toEqual(empty);
  });

  it('allergiya → yangi yozuv, kasallik/dori → vergul bilan qo‘shiladi, qolgani anamnezga', () => {
    const out = applyQuestionnaire(
      {
        allergies: 'penitsillin',
        chronic: 'diabet',
        medications: 'aspirin',
        pregnancy: 'homilador',
        anesthesia: 'yo‘q',
      },
      { ...empty, chronicConditionsText: 'gipertoniya', anamnez: 'eski' },
      { pregnancy: 'Homiladorlik' },
    );
    expect(out.allergies).toEqual([
      { type: 'other', substance: 'penitsillin', severity: 'moderate' },
    ]);
    expect(out.chronicConditionsText).toBe('gipertoniya, diabet');
    expect(out.currentMedicationsText).toBe('aspirin');
    expect(out.anamnez).toBe('eski\nHomiladorlik: homilador');
  });
});
