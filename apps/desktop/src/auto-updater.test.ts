import { beforeEach, describe, expect, mock, test } from 'bun:test';
import type { UpdaterLike } from './auto-updater';
import { setupAutoUpdater } from './auto-updater';

class FakeUpdater implements UpdaterLike {
  autoDownload = false;
  autoInstallOnAppQuit = false;
  checkCalls = 0;
  private downloadedListeners: Array<() => void> = [];
  private errorListeners: Array<(err: Error) => void> = [];

  on(event: 'update-downloaded', listener: () => void): unknown;
  on(event: 'error', listener: (err: Error) => void): unknown;
  on(
    event: 'update-downloaded' | 'error',
    listener: (() => void) | ((err: Error) => void),
  ): unknown {
    if (event === 'update-downloaded') {
      this.downloadedListeners.push(listener as () => void);
    } else {
      this.errorListeners.push(listener as (err: Error) => void);
    }
    return this;
  }

  checkForUpdatesAndNotify(): unknown {
    this.checkCalls += 1;
    return Promise.resolve(null);
  }

  emitDownloaded(): void {
    for (const listener of this.downloadedListeners) listener();
  }

  emitError(err: Error): void {
    for (const listener of this.errorListeners) listener(err);
  }
}

describe('setupAutoUpdater', () => {
  let updater: FakeUpdater;
  let notify: ReturnType<typeof mock>;
  let setTrayToolTip: ReturnType<typeof mock>;
  let scheduleInterval: ReturnType<typeof mock>;

  beforeEach(() => {
    updater = new FakeUpdater();
    notify = mock(() => {});
    setTrayToolTip = mock(() => {});
    scheduleInterval = mock((_fn: () => void, _ms: number) => {});
  });

  test('dev rejimida (isPackaged=false) hech qanday tekshiruv qilmaydi', () => {
    setupAutoUpdater({ isPackaged: false, updater, notify, setTrayToolTip, scheduleInterval });

    expect(updater.checkCalls).toBe(0);
    expect(scheduleInterval).not.toHaveBeenCalled();
    expect(updater.autoDownload).toBe(false);
    expect(updater.autoInstallOnAppQuit).toBe(false);
  });

  test("packaged build'da autoDownload/autoInstallOnAppQuit yoqadi, darhol tekshiradi va 4 soatlik intervalni sozlaydi", () => {
    setupAutoUpdater({ isPackaged: true, updater, notify, setTrayToolTip, scheduleInterval });

    expect(updater.autoDownload).toBe(true);
    expect(updater.autoInstallOnAppQuit).toBe(true);
    expect(updater.checkCalls).toBe(1);
    expect(scheduleInterval).toHaveBeenCalledTimes(1);
    expect(scheduleInterval.mock.calls[0]?.[1]).toBe(4 * 60 * 60 * 1000);
  });

  test('"update-downloaded" hodisasi tray tooltip yangilaydi va bildirishnoma ko\'rsatadi', () => {
    setupAutoUpdater({ isPackaged: true, updater, notify, setTrayToolTip, scheduleInterval });

    updater.emitDownloaded();

    expect(setTrayToolTip).toHaveBeenCalledWith('Dental Service — yangilash tayyor');
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0]?.[0]).toBe('Dental Service');
    expect(notify.mock.calls[0]?.[1]).toContain('Yangilash yuklab olindi');
  });

  test('"error" hodisasi console.error ga log qiladi', () => {
    const originalError = console.error;
    const errSpy = mock(() => {});
    console.error = errSpy as typeof console.error;

    try {
      setupAutoUpdater({ isPackaged: true, updater, notify, setTrayToolTip, scheduleInterval });
      updater.emitError(new Error('network fail'));

      expect(errSpy).toHaveBeenCalledWith('[updater] Xato:', 'network fail');
    } finally {
      console.error = originalError;
    }
  });

  test('intervalMs berilsa scheduleInterval shu qiymat bilan chaqiriladi', () => {
    setupAutoUpdater({
      isPackaged: true,
      updater,
      notify,
      setTrayToolTip,
      scheduleInterval,
      intervalMs: 1000,
    });

    expect(scheduleInterval.mock.calls[0]?.[1]).toBe(1000);
  });
});
