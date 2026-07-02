import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { registerSettingsIpc, SET_SERVER_URL_CHANNEL } from './settings-ipc';

class FakeIpcMain {
  handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>();

  handle(channel: string, listener: (event: unknown, ...args: unknown[]) => unknown): void {
    this.handlers.set(channel, listener);
  }

  invoke(channel: string, ...args: unknown[]): unknown {
    const handler = this.handlers.get(channel);
    if (!handler) throw new Error(`handler ro'yxatdan o'tmagan: ${channel}`);
    return handler({}, ...args);
  }
}

describe('registerSettingsIpc', () => {
  let ipcMain: FakeIpcMain;
  let writeConfig: ReturnType<typeof mock>;

  beforeEach(() => {
    ipcMain = new FakeIpcMain();
    writeConfig = mock((_partial: { serverUrl: string }) => {});
  });

  test("SET_SERVER_URL_CHANNEL kanalida handler ro'yxatdan o'tkazadi", () => {
    registerSettingsIpc({ ipcMain, writeConfig });

    expect(ipcMain.handlers.has(SET_SERVER_URL_CHANNEL)).toBe(true);
  });

  test('serverUrl kiritilganda writeConfig chaqiradi va ulanish tekshiriladi (muvaffaqiyatli)', async () => {
    const checkConnection = mock(async (_url: string) => true);
    registerSettingsIpc({ ipcMain, writeConfig, checkConnection });

    const result = await ipcMain.invoke(SET_SERVER_URL_CHANNEL, 'http://10.0.0.7:80');

    expect(writeConfig).toHaveBeenCalledWith({ serverUrl: 'http://10.0.0.7:80' });
    expect(checkConnection).toHaveBeenCalledWith('http://10.0.0.7:80');
    expect(result).toEqual({ ok: true, connected: true, serverUrl: 'http://10.0.0.7:80' });
  });

  test("ulanish muvaffaqiyatsiz bo'lsa connected:false qaytaradi, lekin config baribir yoziladi", async () => {
    const checkConnection = mock(async (_url: string) => false);
    registerSettingsIpc({ ipcMain, writeConfig, checkConnection });

    const result = await ipcMain.invoke(SET_SERVER_URL_CHANNEL, 'http://10.0.0.9:80');

    expect(writeConfig).toHaveBeenCalledWith({ serverUrl: 'http://10.0.0.9:80' });
    expect(result).toEqual({ ok: true, connected: false, serverUrl: 'http://10.0.0.9:80' });
  });

  test("ulanish muvaffaqiyatli bo'lsa onConnected chaqiriladi", async () => {
    const onConnected = mock((_url: string) => {});
    registerSettingsIpc({
      ipcMain,
      writeConfig,
      checkConnection: async () => true,
      onConnected,
    });

    await ipcMain.invoke(SET_SERVER_URL_CHANNEL, 'http://10.0.0.7:80');

    expect(onConnected).toHaveBeenCalledWith('http://10.0.0.7:80');
  });

  test("ulanish muvaffaqiyatsiz bo'lsa onConnected chaqirilmaydi", async () => {
    const onConnected = mock((_url: string) => {});
    registerSettingsIpc({
      ipcMain,
      writeConfig,
      checkConnection: async () => false,
      onConnected,
    });

    await ipcMain.invoke(SET_SERVER_URL_CHANNEL, 'http://10.0.0.7:80');

    expect(onConnected).not.toHaveBeenCalled();
  });
});
