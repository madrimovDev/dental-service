import { beforeEach, describe, expect, mock, test } from 'bun:test';
// side-effect import — bitta umumiy 'electron' mock ro'yxatdan o'tkaziladi
// (bun test bir process ichida barcha *.test.ts'ni yuklaydi; alohida-alohida
// mock.module('electron', ...) chaqiruvlar fayllar orasidagi yuklash
// tartibiga bog'liq racy natija beradi — test-electron-mock.ts izohiga qarang).
import type { MockMenuItem } from './test-electron-mock.js';
import { resetTrayMockState, trayMockState } from './test-electron-mock.js';

const { createTray, updateTray, setTrayToolTip } = await import('./tray.js');

describe('tray', () => {
  beforeEach(() => {
    resetTrayMockState();
  });

  test("createTray tooltip o'rnatadi va menu quradi", () => {
    const onOpen = mock(() => {});
    const onSettings = mock(() => {});
    const onStop = mock(() => {});

    createTray(
      'server',
      { serverUrl: 'http://localhost:80', connectedClients: 3 },
      { onOpen, onSettings, onStop },
    );

    expect(trayMockState.setToolTipCalls).toEqual(['Dental Service']);
    expect(trayMockState.setContextMenuCalls).toHaveLength(1);
  });

  test("updateTray server rolida serverUrl+connectedClients+licenseInfo ko'rsatadi", () => {
    const onOpen = mock(() => {});
    const onSettings = mock(() => {});
    const onStop = mock(() => {});

    createTray(
      'server',
      { serverUrl: 'http://localhost:80', connectedClients: 3 },
      { onOpen, onSettings, onStop },
    );
    updateTray(
      'server',
      { serverUrl: 'http://localhost:80', connectedClients: 3, licenseInfo: 'Faol litsenziya' },
      { onOpen, onSettings, onStop },
    );

    const template = trayMockState.lastMenuTemplate;
    if (!template) throw new Error('menu template yaratilmadi');
    const infoItem = template[0];
    expect(infoItem?.label).toContain('http://localhost:80');
    expect(infoItem?.label).toContain('3 ta qurilma');
    expect(infoItem?.label).toContain('Faol litsenziya');
    expect(infoItem?.enabled).toBe(false);
  });

  test("updateTray klient rolida ulanish holatini ko'rsatadi", () => {
    const onOpen = mock(() => {});
    const onSettings = mock(() => {});
    const onStop = mock(() => {});

    createTray('client', { serverUrl: 'http://10.0.0.5:80' }, { onOpen, onSettings, onStop });

    const template = trayMockState.lastMenuTemplate;
    if (!template) throw new Error('menu template yaratilmadi');
    expect(template[0]?.label).toContain('Klient');
    expect(template[0]?.label).toContain('http://10.0.0.5:80');
  });

  test('"Ochish" tugmasi bosilganda onOpen chaqiriladi', () => {
    const onOpen = mock(() => {});
    const onSettings = mock(() => {});
    const onStop = mock(() => {});

    createTray('server', { serverUrl: 'http://localhost:80' }, { onOpen, onSettings, onStop });

    const template = trayMockState.lastMenuTemplate;
    if (!template) throw new Error('menu template yaratilmadi');
    const openItem = template.find((item: MockMenuItem) => item.label?.includes('Ochish'));
    openItem?.click?.();

    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  test('server rolida "To\'xtatish" tugmasi onStop chaqiradi', () => {
    const onOpen = mock(() => {});
    const onSettings = mock(() => {});
    const onStop = mock(() => {});

    createTray('server', { serverUrl: 'http://localhost:80' }, { onOpen, onSettings, onStop });

    const template = trayMockState.lastMenuTemplate;
    if (!template) throw new Error('menu template yaratilmadi');
    const stopItem = template.find((item: MockMenuItem) => item.label?.includes("To'xtatish"));
    stopItem?.click?.();

    expect(onStop).toHaveBeenCalledTimes(1);
  });

  test("updateTray klient rolida server topilmasa 'Server topilmadi' holatini ko'rsatadi", () => {
    const onOpen = mock(() => {});
    const onSettings = mock(() => {});
    const onStop = mock(() => {});

    createTray('client', { serverUrl: '', serverFound: false }, { onOpen, onSettings, onStop });

    const template = trayMockState.lastMenuTemplate;
    if (!template) throw new Error('menu template yaratilmadi');
    expect(template[0]?.label).toContain('Server topilmadi');
    expect(template[0]?.label).not.toContain('Ulangan');
  });

  test('klient rolida oxirgi menu band "Chiqish" bo\'ladi', () => {
    const onOpen = mock(() => {});
    const onSettings = mock(() => {});
    const onStop = mock(() => {});

    createTray('client', { serverUrl: 'http://10.0.0.5:80' }, { onOpen, onSettings, onStop });

    const template = trayMockState.lastMenuTemplate;
    if (!template) throw new Error('menu template yaratilmadi');
    const exitItem = template.find((item: MockMenuItem) => item.label?.includes('Chiqish'));
    exitItem?.click?.();

    expect(onStop).toHaveBeenCalledTimes(1);
  });

  test("setTrayToolTip mavjud tray'ning tooltip'ini yangilaydi", () => {
    createTray(
      'server',
      { serverUrl: 'http://localhost:80' },
      { onOpen: mock(() => {}), onSettings: mock(() => {}), onStop: mock(() => {}) },
    );

    setTrayToolTip('Dental Service — yangilash tayyor');

    expect(trayMockState.setToolTipCalls).toEqual([
      'Dental Service',
      'Dental Service — yangilash tayyor',
    ]);
  });
});
