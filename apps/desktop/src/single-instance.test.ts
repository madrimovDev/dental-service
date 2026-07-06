import { describe, expect, mock, test } from 'bun:test';
import { setupSingleInstance, type WindowLike } from './single-instance.js';

const makeWindow = (minimized: boolean): WindowLike & Record<string, ReturnType<typeof mock>> => {
  const win = {
    isMinimized: mock(() => minimized),
    restore: mock(() => {}),
    show: mock(() => {}),
    focus: mock(() => {}),
  };
  return win;
};

describe('setupSingleInstance', () => {
  test("qulf olinmasa quit() chaqiriladi, false qaytadi va second-instance handler ro'yxatdan o'tkazilmaydi", () => {
    const quit = mock(() => {});
    const onSecondInstance = mock((_h: () => void) => {});

    const got = setupSingleInstance({
      requestSingleInstanceLock: () => false,
      quit,
      onSecondInstance,
      getWindow: () => null,
      reopen: () => {},
    });

    expect(got).toBe(false);
    expect(quit).toHaveBeenCalledTimes(1);
    expect(onSecondInstance).not.toHaveBeenCalled();
  });

  test('second-instance kelganda mavjud (minimallashtirilgan) oyna restore+show+focus qilinadi', () => {
    let handler: (() => void) | undefined;
    const win = makeWindow(true);
    const reopen = mock(() => {});

    const got = setupSingleInstance({
      requestSingleInstanceLock: () => true,
      quit: () => {},
      onSecondInstance: (h) => {
        handler = h;
      },
      getWindow: () => win,
      reopen,
    });

    expect(got).toBe(true);
    expect(handler).toBeDefined();
    handler?.();

    expect(win.restore).toHaveBeenCalledTimes(1);
    expect(win.show).toHaveBeenCalledTimes(1);
    expect(win.focus).toHaveBeenCalledTimes(1);
    expect(reopen).not.toHaveBeenCalled();
  });

  test('minimallashtirilmagan oynada restore chaqirilmaydi, show+focus yetarli', () => {
    let handler: (() => void) | undefined;
    const win = makeWindow(false);

    setupSingleInstance({
      requestSingleInstanceLock: () => true,
      quit: () => {},
      onSecondInstance: (h) => {
        handler = h;
      },
      getWindow: () => win,
      reopen: () => {},
    });
    handler?.();

    expect(win.restore).not.toHaveBeenCalled();
    expect(win.show).toHaveBeenCalledTimes(1);
    expect(win.focus).toHaveBeenCalledTimes(1);
  });

  test("oyna yo'q bo'lsa reopen() chaqiriladi", () => {
    let handler: (() => void) | undefined;
    const reopen = mock(() => {});

    setupSingleInstance({
      requestSingleInstanceLock: () => true,
      quit: () => {},
      onSecondInstance: (h) => {
        handler = h;
      },
      getWindow: () => null,
      reopen,
    });
    handler?.();

    expect(reopen).toHaveBeenCalledTimes(1);
  });

  test("oyna ham yo'q, reopen ham no-op bo'lsa xato tashlamaydi", () => {
    let handler: (() => void) | undefined;

    setupSingleInstance({
      requestSingleInstanceLock: () => true,
      quit: () => {},
      onSecondInstance: (h) => {
        handler = h;
      },
      getWindow: () => null,
      reopen: () => {},
    });

    expect(() => handler?.()).not.toThrow();
  });
});
