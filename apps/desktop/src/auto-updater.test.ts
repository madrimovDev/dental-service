import { beforeEach, describe, expect, mock, test } from 'bun:test';
import type { UpdaterLike } from './auto-updater.js';
import { computeInstallAt, setupAutoUpdater } from './auto-updater.js';

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

  rejectNextCheck = false;

  checkForUpdatesAndNotify(): unknown {
    this.checkCalls += 1;
    if (this.rejectNextCheck) {
      return Promise.reject(new Error('network fail'));
    }
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

  test('checkForUpdatesAndNotify() promise reject qilsa unhandled rejection tashlamaydi, console.error ga log qiladi', async () => {
    const originalError = console.error;
    const errSpy = mock(() => {});
    console.error = errSpy as typeof console.error;
    updater.rejectNextCheck = true;

    try {
      expect(() =>
        setupAutoUpdater({ isPackaged: true, updater, notify, setTrayToolTip, scheduleInterval }),
      ).not.toThrow();

      // Promise mikrotasklarini ishlatish uchun navbatni bo'shatamiz.
      await Promise.resolve();
      await Promise.resolve();

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

describe('computeInstallAt (UI-T3: ish vaqtidan keyin)', () => {
  const at = (h: number, m = 0) => new Date(2026, 10, 11, h, m, 0, 0);

  test('ish vaqtida (14:00, yopilish 19:00) — bugun 19:00 ga rejalashtiriladi', () => {
    const r = computeInstallAt(at(14), '19:00');
    expect(r.now).toBe(false);
    expect(r.at.getHours()).toBe(19);
    expect(r.at.getDate()).toBe(11);
  });

  test("yopilgandan keyin (20:00) — hozir o'rnatiladi", () => {
    expect(computeInstallAt(at(20), '19:00').now).toBe(true);
  });

  test("tunda (03:00) — hozir o'rnatiladi, ertalabki qabulni kutdirmaydi", () => {
    expect(computeInstallAt(at(3), '19:00').now).toBe(true);
  });

  test('yaroqsiz yopilish vaqti — 19:00 default', () => {
    expect(computeInstallAt(at(10), 'xato').at.getHours()).toBe(19);
  });
});

describe('setupAutoUpdater yangilanish holati (UI-T3)', () => {
  test("ish vaqtida yuklansa — quitAndInstall CHAQIRILMAYDI, holat ready + installAt bilan emit qilinadi, yopilishga timer qo'yiladi", () => {
    const updater = new FakeUpdater();
    const quit = mock(() => {});
    (updater as unknown as { quitAndInstall: () => void }).quitAndInstall = quit;
    const states: Array<Record<string, unknown>> = [];
    const timers: Array<{ fn: () => void; ms: number }> = [];
    setupAutoUpdater({
      isPackaged: true,
      updater,
      notify: () => {},
      setTrayToolTip: () => {},
      scheduleInterval: () => {},
      now: () => new Date(2026, 10, 11, 14, 0, 0),
      getWorkClose: () => '19:00',
      scheduleTimeout: (fn, ms) => void timers.push({ fn, ms }),
      onState: (s) => void states.push(s as unknown as Record<string, unknown>),
    });
    updater.emitDownloaded();

    expect(quit).not.toHaveBeenCalled();
    expect(states.at(-1)?.phase).toBe('ready');
    expect(typeof states.at(-1)?.installAt).toBe('string');
    expect(timers[0]?.ms).toBe(5 * 60 * 60 * 1000);
    timers[0]?.fn();
    expect(quit).toHaveBeenCalledTimes(1);
  });

  test('yopilgandan keyin yuklansa — darhol quitAndInstall', () => {
    const updater = new FakeUpdater();
    const quit = mock(() => {});
    (updater as unknown as { quitAndInstall: () => void }).quitAndInstall = quit;
    setupAutoUpdater({
      isPackaged: true,
      updater,
      notify: () => {},
      setTrayToolTip: () => {},
      scheduleInterval: () => {},
      now: () => new Date(2026, 10, 11, 21, 0, 0),
      getWorkClose: () => '19:00',
    });
    updater.emitDownloaded();
    expect(quit).toHaveBeenCalledTimes(1);
  });

  test("installNow() boshqaruvi ish vaqtida ham darhol o'rnatadi", () => {
    const updater = new FakeUpdater();
    const quit = mock(() => {});
    (updater as unknown as { quitAndInstall: () => void }).quitAndInstall = quit;
    const ctl = setupAutoUpdater({
      isPackaged: true,
      updater,
      notify: () => {},
      setTrayToolTip: () => {},
      scheduleInterval: () => {},
      now: () => new Date(2026, 10, 11, 14, 0, 0),
      getWorkClose: () => '19:00',
      scheduleTimeout: () => {},
    });
    updater.emitDownloaded();
    ctl?.installNow();
    expect(quit).toHaveBeenCalledTimes(1);
  });
});
