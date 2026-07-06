import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authFetch } from './api';

const fetchMock = vi.fn();
const assignMock = vi.fn();

describe('authFetch', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    assignMock.mockClear();
    vi.stubGlobal('fetch', fetchMock);
    localStorage.clear();
    localStorage.setItem('admin_token', 'stale-token');
    // configurable: true is required — this runs in beforeEach across 3
    // tests, and jsdom's original `location` descriptor is not itself
    // configurable by default, so a 2nd/3rd redefinition without it would
    // throw "Cannot redefine property: location".
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, assign: assignMock },
    });
  });

  it("javob 401 bo'lsa admin_token tozalanadi va /login ga hard-redirect qilinadi", async () => {
    fetchMock.mockResolvedValue({ status: 401, ok: false, json: async () => ({}) });

    await authFetch('/v1/admin/clinics');

    expect(localStorage.getItem('admin_token')).toBeNull();
    expect(assignMock).toHaveBeenCalledWith('/login');
  });

  it("javob 401 bo'lmasa admin_token va navigatsiya o'zgarmaydi", async () => {
    fetchMock.mockResolvedValue({ status: 200, ok: true, json: async () => [] });

    const res = await authFetch('/v1/admin/clinics');

    expect(res.ok).toBe(true);
    expect(localStorage.getItem('admin_token')).toBe('stale-token');
    expect(assignMock).not.toHaveBeenCalled();
  });

  it("Authorization header hamon localStorage tokenidan qo'yiladi", async () => {
    fetchMock.mockResolvedValue({ status: 200, ok: true, json: async () => [] });

    await authFetch('/v1/admin/clinics');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/v1/admin/clinics'),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer stale-token' }),
      }),
    );
  });
});
