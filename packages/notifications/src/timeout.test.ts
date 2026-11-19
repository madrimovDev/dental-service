/**
 * FX-82 (LB) — Telegram/Eskiz tashqi fetch'lari timeout'siz edi: osilgan provayder
 * tx ichida (reminder/recall worker) ulanishni cheksiz ushlab turardi.
 * Endi har fetch AbortSignal bilan: osilgan javob `{ok:false}` ga aylanadi.
 */
import { afterEach, describe, expect, test } from 'bun:test';
import { createEskizChannel, createTelegramChannel } from './index.ts';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Signal abort bo'lguncha osilib turadigan fetch; signal berilmasa — hech qachon tugamaydi. */
const hangingFetch = (seen: { signal?: AbortSignal | null }) =>
  ((_url: unknown, init?: RequestInit) => {
    seen.signal = init?.signal ?? null;
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
    });
  }) as unknown as typeof fetch;

const raceWithDeadline = <T>(p: Promise<T>, ms = 1500): Promise<T | 'HUNG'> =>
  Promise.race([p, new Promise<'HUNG'>((r) => setTimeout(() => r('HUNG'), ms))]);

describe('FX-82 — kanal fetch timeout', () => {
  test("Telegram: osilgan fetch → timeoutMs'dan keyin {ok:false}", async () => {
    const seen: { signal?: AbortSignal | null } = {};
    globalThis.fetch = hangingFetch(seen);
    const r = await raceWithDeadline(
      createTelegramChannel({ botToken: 'x', timeoutMs: 50 }).send('1', { text: 'a' }),
    );
    expect(seen.signal).toBeTruthy();
    expect(r).not.toBe('HUNG');
    expect((r as { ok: boolean }).ok).toBe(false);
  });

  test("Eskiz: osilgan login → timeoutMs'dan keyin {ok:false}", async () => {
    const seen: { signal?: AbortSignal | null } = {};
    globalThis.fetch = hangingFetch(seen);
    const r = await raceWithDeadline(
      createEskizChannel({ email: 'e', password: 'p', timeoutMs: 50 }).send('+998901234567', {
        text: 'a',
      }),
    );
    expect(seen.signal).toBeTruthy();
    expect(r).not.toBe('HUNG');
    expect((r as { ok: boolean }).ok).toBe(false);
  });

  test("Eskiz: login o'tdi, send osilib qoldi → {ok:false}", async () => {
    let call = 0;
    globalThis.fetch = ((url: unknown, init?: RequestInit) => {
      call++;
      if (call === 1) {
        return Promise.resolve(new Response(JSON.stringify({ data: { token: 't' } })));
      }
      return new Promise<Response>((_res, rej) => {
        init?.signal?.addEventListener('abort', () => rej(new Error('aborted')));
      });
    }) as unknown as typeof fetch;
    const r = await raceWithDeadline(
      createEskizChannel({ email: 'e', password: 'p', timeoutMs: 50 }).send('+998901234567', {
        text: 'a',
      }),
    );
    expect(r).not.toBe('HUNG');
    expect((r as { ok: boolean }).ok).toBe(false);
  });
});
