import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { startClientReconnectLoop } from './client-reconnect.js';

describe('startClientReconnectLoop', () => {
  let scheduledFn: (() => void) | null;
  let scheduleInterval: ReturnType<typeof mock>;
  let clearScheduledInterval: ReturnType<typeof mock>;

  beforeEach(() => {
    scheduledFn = null;
    scheduleInterval = mock((fn: () => void, _ms: number) => {
      scheduledFn = fn;
      return 'fake-handle';
    });
    clearScheduledInterval = mock((_handle: unknown) => {});
  });

  test("30s (default) interval bilan scheduleInterval'ni chaqiradi", () => {
    const findServers = mock(async () => []);
    startClientReconnectLoop({
      findServers,
      onFound: mock(() => {}),
      scheduleInterval,
      clearScheduledInterval,
    });

    expect(scheduleInterval).toHaveBeenCalledTimes(1);
    expect(scheduleInterval.mock.calls[0]?.[1]).toBe(30000);
  });

  test('intervalMs berilsa scheduleInterval shu qiymat bilan chaqiriladi', () => {
    startClientReconnectLoop({
      findServers: mock(async () => []),
      onFound: mock(() => {}),
      scheduleInterval,
      clearScheduledInterval,
      intervalMs: 1000,
    });

    expect(scheduleInterval.mock.calls[0]?.[1]).toBe(1000);
  });

  test('har tick findServers chaqiradi, topilmasa onFound chaqirilmaydi va interval davom etadi', async () => {
    const findServers = mock(async () => []);
    const onFound = mock((_servers: unknown) => {});
    startClientReconnectLoop({ findServers, onFound, scheduleInterval, clearScheduledInterval });

    scheduledFn?.();
    await Promise.resolve();
    await Promise.resolve();

    expect(findServers).toHaveBeenCalledTimes(1);
    expect(onFound).not.toHaveBeenCalled();
    expect(clearScheduledInterval).not.toHaveBeenCalled();
  });

  test("findServers server(lar) topsa onFound RO'YXAT bilan chaqiradi va intervalni tozalaydi", async () => {
    const servers = [{ url: 'http://10.0.0.5:80', ip: '10.0.0.5', port: 80 }];
    const findServers = mock(async () => servers);
    const onFound = mock((_servers: unknown) => {});
    startClientReconnectLoop({ findServers, onFound, scheduleInterval, clearScheduledInterval });

    scheduledFn?.();
    await Promise.resolve();
    await Promise.resolve();

    expect(onFound).toHaveBeenCalledWith(servers);
    expect(clearScheduledInterval).toHaveBeenCalledWith('fake-handle');
  });

  // CLI-434 — onFound never auto-connects on its own; it receives the full
  // list (including multiple/rogue candidates) so the caller (main.ts) can
  // route it through the same user-confirmation (TOFU) flow as the initial
  // discovery, instead of silently trusting whichever server answered first.
  test('bir nechta server topilsa — onFound BARCHASINI oladi (birinchisiga avtomatik ulanmaydi)', async () => {
    const servers = [
      { url: 'http://10.0.0.5:80', ip: '10.0.0.5', port: 80 },
      { url: 'http://10.0.0.66:80', ip: '10.0.0.66', port: 80 },
    ];
    const findServers = mock(async () => servers);
    const onFound = mock((_servers: unknown) => {});
    startClientReconnectLoop({ findServers, onFound, scheduleInterval, clearScheduledInterval });

    scheduledFn?.();
    await Promise.resolve();
    await Promise.resolve();

    expect(onFound).toHaveBeenCalledWith(servers);
    expect((onFound.mock.calls[0]?.[0] as unknown[]).length).toBe(2);
  });

  test('qaytarilgan stop funksiyasi intervalni tozalaydi', () => {
    const stop = startClientReconnectLoop({
      findServers: mock(async () => []),
      onFound: mock(() => {}),
      scheduleInterval,
      clearScheduledInterval,
    });

    stop();

    expect(clearScheduledInterval).toHaveBeenCalledWith('fake-handle');
  });

  test('stop() chaqirilgach navbatdagi tick onFound chaqirmaydi', async () => {
    const findServers = mock(async () => [{ url: 'http://10.0.0.5:80', ip: '10.0.0.5', port: 80 }]);
    const onFound = mock((_servers: unknown) => {});
    const stop = startClientReconnectLoop({
      findServers,
      onFound,
      scheduleInterval,
      clearScheduledInterval,
    });

    stop();
    scheduledFn?.();
    await Promise.resolve();
    await Promise.resolve();

    expect(onFound).not.toHaveBeenCalled();
  });

  // FX-95 (LB-04) — klient serverdan oldin yonganda yoki server vaqtincha
  // o'chganda: saqlangan (allaqachon tasdiqlangan) manzil har tick'da qayta
  // tekshiriladi; qaytib kelsa tasdiqlash dialogisiz shu manzilga qaytiladi.
  test('FX-95: saqlangan manzil qayta javob bersa onTrustedBack chaqiriladi, discovery qilinmaydi', async () => {
    const findServers = mock(async () => []);
    const onFound = mock((_servers: unknown) => {});
    const onTrustedBack = mock((_url: string) => {});
    const checkConnection = mock(async (_url: string) => true);
    startClientReconnectLoop({
      findServers,
      onFound,
      trustedUrl: 'http://192.168.1.10:8080',
      checkConnection,
      onTrustedBack,
      scheduleInterval,
      clearScheduledInterval,
    });

    scheduledFn?.();
    for (let i = 0; i < 5; i++) await Promise.resolve();

    expect(checkConnection).toHaveBeenCalledWith('http://192.168.1.10:8080');
    expect(onTrustedBack).toHaveBeenCalledWith('http://192.168.1.10:8080');
    expect(findServers).not.toHaveBeenCalled();
    expect(onFound).not.toHaveBeenCalled();
    expect(clearScheduledInterval).toHaveBeenCalledWith('fake-handle');
  });

  test('FX-95: saqlangan manzil hali javob bermasa discovery davom etadi', async () => {
    const findServers = mock(async () => []);
    const onTrustedBack = mock((_url: string) => {});
    startClientReconnectLoop({
      findServers,
      onFound: mock(() => {}),
      trustedUrl: 'http://192.168.1.10:8080',
      checkConnection: mock(async () => false),
      onTrustedBack,
      scheduleInterval,
      clearScheduledInterval,
    });

    scheduledFn?.();
    for (let i = 0; i < 5; i++) await Promise.resolve();

    expect(onTrustedBack).not.toHaveBeenCalled();
    expect(findServers).toHaveBeenCalledTimes(1);
    expect(clearScheduledInterval).not.toHaveBeenCalled();
  });
});
