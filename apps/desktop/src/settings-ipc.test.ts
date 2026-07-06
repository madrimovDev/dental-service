import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { registerSettingsIpc, SET_SERVER_URL_CHANNEL, validateServerUrl } from './settings-ipc.js';

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

  // CLI-434 — evil-twin fix (b): invalid scheme/host must be rejected BEFORE
  // writeConfig or checkConnection are ever called (no rogue URL persisted,
  // no health-check request goes out to a public/attacker host).
  test("noto'g'ri URL (masalan public host) uchun writeConfig/checkConnection chaqirilmaydi, {ok:false} qaytadi", async () => {
    const checkConnection = mock(async (_url: string) => true);
    registerSettingsIpc({ ipcMain, writeConfig, checkConnection });

    const result = await ipcMain.invoke(SET_SERVER_URL_CHANNEL, 'http://evil.com');

    expect(writeConfig).not.toHaveBeenCalled();
    expect(checkConnection).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: false, code: 'INVALID_URL' });
  });

  test('javascript: scheme rad etiladi', async () => {
    const result = await (async () => {
      registerSettingsIpc({ ipcMain, writeConfig });
      return ipcMain.invoke(SET_SERVER_URL_CHANNEL, 'javascript:alert(1)');
    })();

    expect(writeConfig).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: false, code: 'INVALID_URL' });
  });
});

describe('validateServerUrl (CLI-434)', () => {
  test.each([
    ['http://192.168.1.5:8000', true],
    ['http://localhost:8000', true],
    ['https://server.local', true],
    ['http://10.0.0.7:80', true],
    ['http://127.0.0.1:8000', true],
    ['http://172.16.5.5', true],
    ['http://172.31.255.255', true],
  ])('%s -> ok:%s (allowed LAN/localhost/.local host)', (url, expectedOk) => {
    expect(validateServerUrl(url).ok).toBe(expectedOk);
  });

  test.each([
    ['file:///etc/passwd', 'file: scheme'],
    ['javascript:alert(1)', 'javascript: scheme'],
    ['data:text/html,<script>alert(1)</script>', 'data: scheme'],
    ['http://evil.com', 'public hostname'],
    ['http://8.8.8.8', 'public IP'],
    ['http://172.32.0.1', 'just outside the 172.16-31 private range'],
    ['not a url at all', 'unparsable'],
    ['', 'empty string'],
  ])('%s -> rejected (%s)', (url) => {
    const result = validateServerUrl(url);
    expect(result.ok).toBe(false);
    expect(result.code).toBe('INVALID_URL');
  });

  test('non-string input is rejected', () => {
    expect(validateServerUrl(undefined).ok).toBe(false);
    expect(validateServerUrl(123).ok).toBe(false);
    expect(validateServerUrl(null).ok).toBe(false);
  });
});
