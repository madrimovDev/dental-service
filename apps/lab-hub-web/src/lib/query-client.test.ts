import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from '@/stores/auth';
import { mockHub, signIn } from '../test-utils';
import { api } from './api';
import { queryClient } from './query-client';

describe('FX-140: sessiya tugaganda React Query keshi tozalanadi', () => {
  beforeEach(() => {
    localStorage.clear();
    queryClient.clear();
    signIn('lead');
  });

  it('logout keshni tozalaydi (boshqa foydalanuvchi eski ma’lumotni ko‘rmasin)', () => {
    queryClient.setQueryData(['cases'], [{ id: 'old-lab-case' }]);
    expect(queryClient.getQueryData(['cases'])).toBeDefined();
    useAuth.getState().logout();
    expect(queryClient.getQueryData(['cases'])).toBeUndefined();
  });

  it('401 yo‘li ham keshni tozalaydi', async () => {
    queryClient.setQueryData(['cases'], [{ id: 'old-lab-case' }]);
    const hub = mockHub({
      'GET /v1/lab/x': () => ({ status: 401, body: { error: { code: 'auth.unauthorized' } } }),
    });
    vi.stubGlobal('fetch', hub.fn);
    await expect(api.get('/v1/lab/x')).rejects.toBeTruthy();
    expect(useAuth.getState().token).toBeNull();
    expect(queryClient.getQueryData(['cases'])).toBeUndefined();
  });
});
