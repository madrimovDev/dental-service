import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { startClientReconnectLoop } from './client-reconnect';

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
    const findServer = mock(async () => null);
    startClientReconnectLoop({
      findServer,
      onFound: mock(() => {}),
      scheduleInterval,
      clearScheduledInterval,
    });

    expect(scheduleInterval).toHaveBeenCalledTimes(1);
    expect(scheduleInterval.mock.calls[0]?.[1]).toBe(30000);
  });

  test('intervalMs berilsa scheduleInterval shu qiymat bilan chaqiriladi', () => {
    startClientReconnectLoop({
      findServer: mock(async () => null),
      onFound: mock(() => {}),
      scheduleInterval,
      clearScheduledInterval,
      intervalMs: 1000,
    });

    expect(scheduleInterval.mock.calls[0]?.[1]).toBe(1000);
  });

  test('har tick findServer chaqiradi, topilmasa onFound chaqirilmaydi va interval davom etadi', async () => {
    const findServer = mock(async () => null);
    const onFound = mock((_url: string) => {});
    startClientReconnectLoop({ findServer, onFound, scheduleInterval, clearScheduledInterval });

    scheduledFn?.();
    await Promise.resolve();
    await Promise.resolve();

    expect(findServer).toHaveBeenCalledTimes(1);
    expect(onFound).not.toHaveBeenCalled();
    expect(clearScheduledInterval).not.toHaveBeenCalled();
  });

  test('findServer server topsa onFound chaqiradi va intervalni tozalaydi', async () => {
    const findServer = mock(async () => 'http://10.0.0.5:80');
    const onFound = mock((_url: string) => {});
    startClientReconnectLoop({ findServer, onFound, scheduleInterval, clearScheduledInterval });

    scheduledFn?.();
    await Promise.resolve();
    await Promise.resolve();

    expect(onFound).toHaveBeenCalledWith('http://10.0.0.5:80');
    expect(clearScheduledInterval).toHaveBeenCalledWith('fake-handle');
  });

  test('qaytarilgan stop funksiyasi intervalni tozalaydi', () => {
    const stop = startClientReconnectLoop({
      findServer: mock(async () => null),
      onFound: mock(() => {}),
      scheduleInterval,
      clearScheduledInterval,
    });

    stop();

    expect(clearScheduledInterval).toHaveBeenCalledWith('fake-handle');
  });

  test('stop() chaqirilgach navbatdagi tick onFound chaqirmaydi', async () => {
    const findServer = mock(async () => 'http://10.0.0.5:80');
    const onFound = mock((_url: string) => {});
    const stop = startClientReconnectLoop({
      findServer,
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
});
