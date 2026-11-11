import { describe, expect, test } from 'bun:test';
import { findDrugAllergyConflicts, normalizeDrugName } from './drug-allergy.ts';

const allergy = (substance: string) => ({ substance });

describe('normalizeDrugName', () => {
  test('lotin / kirill / xalqaro yozuv bir xil shaklga keladi', () => {
    const a = normalizeDrugName('Amoxicillin 500 mg');
    expect(normalizeDrugName('Амоксициллин')).toBe(normalizeDrugName('amoksitsillin'));
    expect(a.startsWith('amoksitsilin')).toBe(true);
  });
});

describe('findDrugAllergyConflicts', () => {
  test('penitsillin allergiyasi → amoksitsillin (guruh bo‘yicha)', () => {
    const r = findDrugAllergyConflicts('Amoksitsillin 500 mg', [allergy('Penitsillin')]);
    expect(r).toHaveLength(1);
    expect(r[0]?.group).toBe('penicillin');
    expect(r[0]?.allergen).toBe('Penitsillin');
  });

  test('ampitsillin / augmentin / ruscha yozuv ham topiladi', () => {
    expect(findDrugAllergyConflicts('Ампициллин', [allergy('пенициллин')])).toHaveLength(1);
    expect(findDrugAllergyConflicts('Augmentin 625', [allergy('Penicillin')])).toHaveLength(1);
    expect(findDrugAllergyConflicts('Flemoxin Solutab', [allergy('penitsillin')])).toHaveLength(1);
  });

  test('allergiya boshqa guruhda bo‘lsa — to‘qnashuv yo‘q', () => {
    expect(findDrugAllergyConflicts('Ibuprofen 400 mg', [allergy('Penitsillin')])).toEqual([]);
    expect(findDrugAllergyConflicts('Amoksitsillin', [allergy('Lateks')])).toEqual([]);
  });

  test('to‘g‘ridan-to‘g‘ri nom mos kelsa (guruhsiz modda)', () => {
    const r = findDrugAllergyConflicts('Paratsetamol 500 mg', [allergy('paratsetamol')]);
    expect(r).toHaveLength(1);
    expect(r[0]?.group).toBe('direct');
  });

  test('NSAID guruhi: aspirin allergiyasi → ibuprofen, diklofenak', () => {
    expect(findDrugAllergyConflicts('Diklofenak', [allergy('Aspirin')])).toHaveLength(1);
    expect(findDrugAllergyConflicts('Ibuprofen', [allergy('NSAID')])).toHaveLength(1);
  });

  test('bo‘sh / juda qisqa kirish — hech narsa topilmaydi', () => {
    expect(findDrugAllergyConflicts('', [allergy('penitsillin')])).toEqual([]);
    expect(findDrugAllergyConflicts('Amoksitsillin', [])).toEqual([]);
    expect(findDrugAllergyConflicts('Amoksitsillin', null)).toEqual([]);
    expect(findDrugAllergyConflicts('Ab', [allergy('ab')])).toEqual([]);
  });

  test('bir nechta allergiya — har bir mos kelganini qaytaradi, dublikatsiz', () => {
    const r = findDrugAllergyConflicts('Amoksitsillin', [
      allergy('Penitsillin'),
      allergy('Ampitsillin'),
      allergy('Lateks'),
    ]);
    expect(r.map((x) => x.allergen).sort()).toEqual(['Ampitsillin', 'Penitsillin']);
  });
});
