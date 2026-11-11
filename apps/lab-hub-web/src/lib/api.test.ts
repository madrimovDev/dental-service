import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from '@/stores/auth';
import { mockHub, signIn } from '../test-utils';
import { api, HubApiError } from './api';

describe('api client', () => {
  beforeEach(() => {
    localStorage.clear();
    signIn('lead');
  });

  it('Bearer token va JSON yuboradi', async () => {
    const hub = mockHub({ 'POST /v1/lab/x': () => ({ body: { ok: true } }) });
    vi.stubGlobal('fetch', hub.fn);
    await api.post('/v1/lab/x', { a: 1 });
    expect(hub.calls[0]?.headers.get('Authorization')).toBe('Bearer test-token');
    expect(hub.calls[0]?.body).toEqual({ a: 1 });
  });

  it('xatoda HubApiError(status, code) tashlaydi', async () => {
    const hub = mockHub({
      'GET /v1/lab/x': () => ({ status: 409, body: { error: { code: 'case.bad_transition' } } }),
    });
    vi.stubGlobal('fetch', hub.fn);
    await expect(api.get('/v1/lab/x')).rejects.toMatchObject({
      status: 409,
      code: 'case.bad_transition',
    });
    await expect(api.get('/v1/lab/x')).rejects.toBeInstanceOf(HubApiError);
  });

  it('401 — sessiyani tozalaydi', async () => {
    const hub = mockHub({
      'GET /v1/lab/x': () => ({ status: 401, body: { error: { code: 'auth.unauthorized' } } }),
    });
    vi.stubGlobal('fetch', hub.fn);
    await expect(api.get('/v1/lab/x')).rejects.toBeInstanceOf(HubApiError);
    expect(useAuth.getState().token).toBeNull();
  });

  it('403 password_change_required — majburiy almashtirish bayrog‘i', async () => {
    const hub = mockHub({
      'GET /v1/lab/x': () => ({
        status: 403,
        body: { error: { code: 'auth.password_change_required' } },
      }),
    });
    vi.stubGlobal('fetch', hub.fn);
    await expect(api.get('/v1/lab/x')).rejects.toBeInstanceOf(HubApiError);
    expect(useAuth.getState().mustChangePassword).toBe(true);
  });

  it('403 lab.subscription_expired — obuna holati expired', async () => {
    const hub = mockHub({
      'GET /v1/lab/x': () => ({
        status: 403,
        body: { error: { code: 'lab.subscription_expired' } },
      }),
    });
    vi.stubGlobal('fetch', hub.fn);
    await expect(api.get('/v1/lab/x')).rejects.toBeInstanceOf(HubApiError);
    expect(useAuth.getState().lab?.subscription).toBe('expired');
  });

  it('upload — FormData, Content-Type qo‘lda qo‘yilmaydi', async () => {
    const hub = mockHub({ 'POST /v1/lab/f': () => ({ status: 201, body: { file: {} } }) });
    vi.stubGlobal('fetch', hub.fn);
    const fd = new FormData();
    fd.append('file', new File(['x'], 'a.stl'));
    await api.upload('/v1/lab/f', fd);
    expect(hub.calls[0]?.body).toBeInstanceOf(FormData);
    expect(hub.calls[0]?.headers.get('Content-Type')).toBeNull();
  });
});
