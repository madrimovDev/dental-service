import { describe, expect, mock, test } from 'bun:test';
import { configureClient, customInstance, isClientConfigured } from './mutator.ts';

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
      method: 'get',
      params: { search: undefined, page: undefined },
    });

    expect(calls[0]).toBe('http://x/api/things'); // no trailing ?
    expect(res).toEqual({ success: true, data: { ok: 1 } });

    globalThis.fetch = realFetch;
  });
});
