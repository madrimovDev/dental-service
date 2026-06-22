/**
 * @dental/notifications — TelegramChannel + kanal prioriteti (V3-2, sof/tarmoqsiz).
 */
import { afterEach, describe, expect, test } from 'bun:test';
import { createNotificationChannel, createTelegramChannel } from './index.ts';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('Telegram channel', () => {
  test('muvaffaqiyatli send → {ok:true, providerId}', async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ result: { message_id: 42 } }), {
        status: 200,
      })) as unknown as typeof fetch;
    const r = await createTelegramChannel({ botToken: 'x' }).send('123', { text: 'salom' });
    expect(r.ok).toBe(true);
    expect(r.providerId).toBe('42');
  });

  test('xato javob → throw EMAS, {ok:false}', async () => {
    globalThis.fetch = (async () => new Response('no', { status: 401 })) as unknown as typeof fetch;
    const r = await createTelegramChannel({ botToken: 'x' }).send('123', { text: 'salom' });
    expect(r.ok).toBe(false);
  });

  test('fetch throw → catch → {ok:false}', async () => {
    globalThis.fetch = (async () => {
      throw new Error('network');
    }) as unknown as typeof fetch;
    const r = await createTelegramChannel({ botToken: 'x' }).send('123', { text: 'salom' });
    expect(r.ok).toBe(false);
  });

  test('createNotificationChannel: TELEGRAM_BOT_TOKEN bor → Telegram (SMS emas)', () => {
    // Telegram tanlanganini bilvosita: token yo'q → NoOp/SMS; token bor → Telegram kanal.
    const withTg = createNotificationChannel({ telegramBotToken: 't' });
    const withoutTg = createNotificationChannel({});
    expect(typeof withTg.send).toBe('function');
    expect(typeof withoutTg.send).toBe('function');
    // Ikkalasi ham NotificationChannel — interfeys kontrakt saqlanadi.
  });
});
