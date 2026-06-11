import type { Service } from '@dental/api-client';
import { describe, expect, it } from 'vitest';
import { filterServices, groupByCategory, toServiceVM } from './services.mappers';

function svc(over: Partial<Service> = {}): Service {
  return {
    id: 's1',
    tenantId: 't',
    code: 'PL-001',
    nameUz: 'Plomba',
    nameRu: 'Пломба',
    category: 'Terapevtika',
    durationMinutes: 30,
    requiredRole: null,
    descriptionUz: null,
    descriptionRu: null,
    isActive: true,
    createdAt: '2026-06-11T00:00:00Z',
    updatedAt: '2026-06-11T00:00:00Z',
    deletedAt: null,
    ...over,
  };
}

describe('services.mappers', () => {
  it('toServiceVM: kerakli maydonlarni oladi', () => {
    const vm = toServiceVM(svc());
    expect(vm).toEqual({
      id: 's1',
      code: 'PL-001',
      nameUz: 'Plomba',
      nameRu: 'Пломба',
      category: 'Terapevtika',
      durationMinutes: 30,
      isActive: true,
    });
  });

  it("filterServices: nom bo'yicha case-insensitive", () => {
    const list = [svc({ id: 'a', nameUz: 'Plomba' }), svc({ id: 'b', nameUz: 'Tozalash' })];
    expect(filterServices(list, 'plom', null).map((s) => s.id)).toEqual(['a']);
  });

  it("filterServices: kod bo'yicha", () => {
    const list = [svc({ id: 'a', code: 'PL-001' }), svc({ id: 'b', code: 'FK-002' })];
    expect(filterServices(list, 'fk', null).map((s) => s.id)).toEqual(['b']);
  });

  it('filterServices: kategoriya filter', () => {
    const list = [
      svc({ id: 'a', category: 'Terapevtika' }),
      svc({ id: 'b', category: 'Ortopediya' }),
    ];
    expect(filterServices(list, '', 'Ortopediya').map((s) => s.id)).toEqual(['b']);
  });

  it("filterServices: bo'sh qidiruv + filter yo'q → hammasi", () => {
    const list = [svc({ id: 'a' }), svc({ id: 'b' })];
    expect(filterServices(list, '', null)).toHaveLength(2);
  });

  it('groupByCategory: kategoriya alifbo tartibida, null oxirida', () => {
    const groups = groupByCategory([
      svc({ id: 'a', category: 'Ortopediya' }),
      svc({ id: 'b', category: null }),
      svc({ id: 'c', category: 'Terapevtika' }),
      svc({ id: 'd', category: 'Ortopediya' }),
    ]);
    expect(groups.map((g) => g.category)).toEqual(['Ortopediya', 'Terapevtika', null]);
    expect(groups[0]?.services.map((s) => s.id)).toEqual(['a', 'd']);
    expect(groups[2]?.services.map((s) => s.id)).toEqual(['b']);
  });
});
