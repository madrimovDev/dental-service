import { describe, expect, mock, test } from 'bun:test';
import { EventEmitter } from 'node:events';
import { attachLoadFailureHandler, resolveClientStartup } from './client-startup.js';

const server = (ip: string) => ({ url: `http://${ip}:8080`, ip, port: 8080 });

describe('FX-95: resolveClientStartup', () => {
  test("saqlangan (TOFU) manzil /api/health'dan o'tsa — discovery'siz shu manzilga ulanadi", async () => {
    const findServers = mock(async () => []);
    const checkConnection = mock(async (_u: string) => true);
    const res = await resolveClientStartup({
      trustedUrl: 'http://192.168.1.10:8080',
      checkConnection,
      findServers,
      chooseServerUrl: mock(async () => null),
      writeConfig: mock(() => {}),
    });
    expect(res).toEqual({ kind: 'connected', url: 'http://192.168.1.10:8080' });
    expect(checkConnection).toHaveBeenCalledWith('http://192.168.1.10:8080');
    expect(findServers).not.toHaveBeenCalled();
  });

  test("saqlangan manzil javob bermasa (IP o'zgargan) — health-check'siz OCHILMAYDI, discovery + tasdiqlashga o'tadi", async () => {
    const writeConfig = mock((_p: { serverUrl: string }) => {});
    const chooseServerUrl = mock(async (s: Array<{ url: string }>) => s[0]?.url ?? null);
    const res = await resolveClientStartup({
      trustedUrl: 'http://192.168.1.10:8080',
      checkConnection: mock(async () => false),
      findServers: mock(async () => [server('192.168.1.14')]),
      chooseServerUrl,
      writeConfig,
    });
    expect(res).toEqual({ kind: 'connected', url: 'http://192.168.1.14:8080' });
    expect(chooseServerUrl).toHaveBeenCalledTimes(1);
    expect(writeConfig).toHaveBeenCalledWith({ serverUrl: 'http://192.168.1.14:8080' });
  });

  test("saqlangan manzil javob bermasa va hech narsa topilmasa — 'Server topilmadi' holati (saqlangan manzil o'chirilmaydi)", async () => {
    const writeConfig = mock((_p: { serverUrl: string }) => {});
    const res = await resolveClientStartup({
      trustedUrl: 'http://192.168.1.10:8080',
      checkConnection: mock(async () => false),
      findServers: mock(async () => []),
      chooseServerUrl: mock(async () => null),
      writeConfig,
    });
    expect(res).toEqual({ kind: 'not_found' });
    expect(writeConfig).not.toHaveBeenCalled();
  });

  test("saqlangan manzil yo'q — discovery, tasdiqlansa config'ga yoziladi", async () => {
    const writeConfig = mock((_p: { serverUrl: string }) => {});
    const checkConnection = mock(async () => true);
    const res = await resolveClientStartup({
      trustedUrl: null,
      checkConnection,
      findServers: mock(async () => [server('10.0.0.9')]),
      chooseServerUrl: mock(async () => 'http://10.0.0.9:8080'),
      writeConfig,
    });
    expect(res).toEqual({ kind: 'connected', url: 'http://10.0.0.9:8080' });
    expect(writeConfig).toHaveBeenCalledWith({ serverUrl: 'http://10.0.0.9:8080' });
  });
});

class FakeContents extends EventEmitter {}

describe('FX-95: attachLoadFailureHandler', () => {
  test('asosiy freym yuklanmasa onFail chaqiriladi', () => {
    const contents = new FakeContents();
    const onFail = mock((_u: string) => {});
    attachLoadFailureHandler(contents, onFail);
    contents.emit(
      'did-fail-load',
      {},
      -102,
      'ERR_CONNECTION_REFUSED',
      'http://192.168.1.10:8080/',
      true,
    );
    expect(onFail).toHaveBeenCalledWith('http://192.168.1.10:8080/');
  });

  test("sub-freym xatosi yoki bekor qilingan navigatsiya (-3 ERR_ABORTED) e'tiborsiz", () => {
    const contents = new FakeContents();
    const onFail = mock((_u: string) => {});
    attachLoadFailureHandler(contents, onFail);
    contents.emit('did-fail-load', {}, -102, 'ERR_CONNECTION_REFUSED', 'http://x/frame', false);
    contents.emit('did-fail-load', {}, -3, 'ERR_ABORTED', 'http://192.168.1.10:8080/', true);
    expect(onFail).not.toHaveBeenCalled();
  });
});
