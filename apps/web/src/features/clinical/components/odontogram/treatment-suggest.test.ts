import { describe, expect, it } from 'vitest';
import { suggestServices } from './treatment-suggest';

const svc = (id: string, nameUz: string, extra: Record<string, unknown> = {}) => ({
  id,
  code: id,
  nameUz,
  nameRu: null,
  category: null,
  descriptionUz: null,
  descriptionRu: null,
  isActive: true,
  ...extra,
});

const dx = (code: string, nameUz: string, nameRu = '') => ({
  id: code,
  code,
  nameUz,
  nameRu,
  category: null,
  descriptionUz: null,
  descriptionRu: null,
});

describe('suggestServices', () => {
  const catalog = [
    svc('s1', 'Plomba (kompozit)'),
    svc('s2', 'Ildiz kanalini davolash'),
    svc('s3', 'Tish olish'),
    svc('s4', 'Professional tozalash'),
    svc('off', 'Plomba arxiv', { isActive: false }),
  ];

  it('diagnoz nomidagi o‘zakka mos xizmatni topadi', () => {
    const r = suggestServices(dx('X', 'Plomba atrofida kariyes'), catalog, 'uz');
    expect(r.map((s) => s.id)).toContain('s1');
  });

  it('ICD-10 kod guruhi (K04 — pulpa) endodontik xizmatlarni oldinga olib chiqadi', () => {
    const r = suggestServices(dx('K04.0', 'Pulpit'), catalog, 'uz');
    expect(r[0]?.id).toBe('s2');
  });

  it('faol bo‘lmagan xizmat taklif qilinmaydi; moslik yo‘q bo‘lsa bo‘sh ro‘yxat', () => {
    expect(suggestServices(dx('K02.1', 'Kariyes'), catalog, 'uz').map((s) => s.id)).not.toContain(
      'off',
    );
    expect(suggestServices(dx('Z99', 'Noma’lum holat'), catalog, 'uz')).toEqual([]);
  });

  it('diagnoz yo‘q bo‘lsa bo‘sh; limitga amal qiladi', () => {
    expect(suggestServices(null, catalog, 'uz')).toEqual([]);
    const many = Array.from({ length: 10 }, (_, i) => svc(`p${i}`, `Plomba ${i}`));
    expect(suggestServices(dx('K02', 'Kariyes plomba'), many, 'uz', 3)).toHaveLength(3);
  });
});
