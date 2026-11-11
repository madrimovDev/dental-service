import { describe, expect, mock, test } from 'bun:test';
import { configureClient, customInstance, fetchBlob, isClientConfigured } from './mutator.ts';

describe('mutator', () => {
  test('customInstance is a function', () => {
    expect(typeof customInstance).toBe('function');
  });

  test('configureClient marks the client ready', () => {
    configureClient({ baseUrl: '', getAccessToken: () => null });
    expect(isClientConfigured()).toBe(true);
  });

  test('customInstance builds URL without trailing ? when params all undefined, returns envelope', async () => {
    const calls: string[] = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = mock(async (url: string | URL | Request) => {
      calls.push(String(url));
      return new Response(JSON.stringify({ success: true, data: { ok: 1 } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as unknown as typeof fetch;

    configureClient({ baseUrl: 'http://x', getAccessToken: () => null });
    const res = await customInstance<{ success: true; data: { ok: number } }>({
      url: '/api/things',
      method: 'GET',
      params: { search: undefined, page: undefined },
    });

    expect(calls[0]).toBe('http://x/api/things'); // no trailing ?
    expect(res).toEqual({ success: true, data: { ok: 1 } });

    globalThis.fetch = realFetch;
  });

  describe('fetchBlob (P11)', () => {
    const realFetch = globalThis.fetch;
    const restore = () => {
      globalThis.fetch = realFetch;
    };

    test('Authorization: Bearer yuboradi va Blob qaytaradi, baseUrl qo‘shiladi', async () => {
      const seen: { url: string; auth: string | null }[] = [];
      globalThis.fetch = mock(async (url: string | URL | Request, init?: RequestInit) => {
        seen.push({ url: String(url), auth: new Headers(init?.headers).get('Authorization') });
        return new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { 'Content-Type': 'image/png' },
        });
      }) as unknown as typeof fetch;
      configureClient({ baseUrl: 'http://x', getAccessToken: () => 'tok-1' });

      const blob = await fetchBlob('/uploads/k');
      expect(seen).toEqual([{ url: 'http://x/uploads/k', auth: 'Bearer tok-1' }]);
      expect(blob.size).toBe(3);
      restore();
    });

    test('401 -> refresh -> yangi token bilan qayta uriniladi', async () => {
      let token = 'old';
      const auths: (string | null)[] = [];
      globalThis.fetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
        const auth = new Headers(init?.headers).get('Authorization');
        auths.push(auth);
        if (auth === 'Bearer old') {
          return new Response(
            JSON.stringify({ success: false, error: { code: 'auth.invalid_token', message: 'x' } }),
            { status: 401 },
          );
        }
        return new Response(new Uint8Array([9]), { status: 200 });
      }) as unknown as typeof fetch;
      configureClient({
        baseUrl: '',
        getAccessToken: () => token,
        getRefreshToken: () => 'rt',
        refreshTokens: async () => ({ accessToken: 'new', refreshToken: 'rt2' }),
        onTokensRefreshed: ({ accessToken }) => {
          token = accessToken;
        },
      });

      const blob = await fetchBlob('/uploads/k');
      expect(auths).toEqual(['Bearer old', 'Bearer new']);
      expect(blob.size).toBe(1);
      restore();
    });

    test('403 JSON envelope -> ApiError(code, status)', async () => {
      globalThis.fetch = mock(
        async () =>
          new Response(
            JSON.stringify({ success: false, error: { code: 'permission.denied', message: 'no' } }),
            { status: 403 },
          ),
      ) as unknown as typeof fetch;
      configureClient({ baseUrl: '', getAccessToken: () => 't' });

      await expect(fetchBlob('/uploads/k')).rejects.toMatchObject({
        code: 'permission.denied',
        status: 403,
      });
      restore();
    });
  });
});
