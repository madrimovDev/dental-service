import { describe, expect, it } from 'vitest';
import { toServiceCategoryVM } from './service-categories.mappers';

describe('toServiceCategoryVM', () => {
  it('maps dto to view-model with null nameRu fallback', () => {
    const vm = toServiceCategoryVM({
      id: 'c1',
      tenantId: 't1',
      name: 'Terapevtika',
      nameRu: null,
      createdAt: '2026-06-27T10:00:00.000Z',
      updatedAt: '2026-06-27T10:00:00.000Z',
    } as import('@dental/api-client').ServiceCategory & { nameRu: null });
    expect(vm).toEqual({ id: 'c1', name: 'Terapevtika', nameRu: null });
  });
});
