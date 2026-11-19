import { describe, expect, mock, test } from 'bun:test';
import { EventEmitter } from 'node:events';
import {
  attachLoadFailureHandler,
  resolveClientStartup,
  verifyServerPin,
} from './client-startup.js';

const server = (ip: string) => ({ url: `http://${ip}:8080`, ip, port: 8080 });

describe('FX-95: resolveClientStartup', () => {
  test("saqlangan (TOFU) manzil /api/health'dan o'tsa — discovery'siz shu manzilga ulanadi", async () => {
    const findServers = mock(async () => []);
    const checkConnection = mock(async (_u: string) => ({ serverId: null }));
    const res = await resolveClientStartup({
      trustedUrl: 'http://192.168.1.10:8080',
      pinnedServerId: null,
      probe: checkConnection,
      findServers,
      chooseServerUrl: mock(async () => null),
      writeConfig: mock(() => {}),
    });
    expect(res).toEqual({ kind: 'connected', url: 'http://192.168.1.10:8080' });
    expect(checkConnection).toHaveBeenCalledWith('http://192.168.1.10:8080');
    expect(findServers).not.toHaveBeenCalled();
  });

  test("saqlangan manzil javob bermasa (IP o'zgargan) — health-check'siz OCHILMAYDI, discovery + tasdiqlashga o'tadi", async () => {
    const writeConfig = mock((_p: Record<string, unknown>) => {});
    const chooseServerUrl = mock(async (s: Array<{ url: string }>) => s[0]?.url ?? null);
    const res = await resolveClientStartup({
      trustedUrl: 'http://192.168.1.10:8080',
      pinnedServerId: null,
      probe: mock(async () => null),
      findServers: mock(async () => [server('192.168.1.14')]),
      chooseServerUrl,
      writeConfig,
    });
    expect(res).toEqual({ kind: 'connected', url: 'http://192.168.1.14:8080' });
    expect(chooseServerUrl).toHaveBeenCalledTimes(1);
    expect(writeConfig).toHaveBeenCalledWith({
      serverUrl: 'http://192.168.1.14:8080',
      trustedServerId: null,
    });
  });

  test("saqlangan manzil javob bermasa va hech narsa topilmasa — 'Server topilmadi' holati (saqlangan manzil o'chirilmaydi)", async () => {
    const writeConfig = mock((_p: Record<string, unknown>) => {});
    const res = await resolveClientStartup({
      trustedUrl: 'http://192.168.1.10:8080',
      pinnedServerId: null,
      probe: mock(async () => null),
      findServers: mock(async () => []),
      chooseServerUrl: mock(async () => null),
      writeConfig,
    });
    expect(res).toEqual({ kind: 'not_found' });
    expect(writeConfig).not.toHaveBeenCalled();
  });

  test("saqlangan manzil yo'q — discovery, tasdiqlansa config'ga yoziladi", async () => {
    const writeConfig = mock((_p: Record<string, unknown>) => {});
    const checkConnection = mock(async () => ({ serverId: null }));
    const res = await resolveClientStartup({
      trustedUrl: null,
      pinnedServerId: null,
      probe: checkConnection,
      findServers: mock(async () => [server('10.0.0.9')]),
      chooseServerUrl: mock(async () => 'http://10.0.0.9:8080'),
      writeConfig,
    });
    expect(res).toEqual({ kind: 'connected', url: 'http://10.0.0.9:8080' });
    expect(writeConfig).toHaveBeenCalledWith({
      serverUrl: 'http://10.0.0.9:8080',
      trustedServerId: null,
    });
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

// FX-145 (LC-23) — TOFU faqat IP'ni emas, server identifikatorini ham pinlaydi:
// saqlangan manzilda BOSHQA server (DHCP almashuvi, boshqa o'rnatma) javob
// bersa jim ulanilmaydi — qayta tasdiqlash (discovery + dialog) so'raladi.
describe('FX-145: resolveClientStartup server identifikatori', () => {
  const probeWith = (id: string | null) => mock(async (_u: string) => ({ serverId: id }));

  test('pinlangan id mos kelsa — ulanadi', async () => {
    const findServers = mock(async () => []);
    const res = await resolveClientStartup({
      trustedUrl: 'http://192.168.1.10:8080',
      pinnedServerId: 'srv-A',
      probe: probeWith('srv-A'),
      findServers,
      chooseServerUrl: mock(async () => null),
      writeConfig: mock(() => {}),
    });
    expect(res).toEqual({ kind: 'connected', url: 'http://192.168.1.10:8080' });
    expect(findServers).not.toHaveBeenCalled();
  });

  test("saqlangan manzilda boshqa server (id mos emas) — ulanmaydi, qayta tasdiqlash so'raladi", async () => {
    const chooseServerUrl = mock(async () => null);
    const onIdentityMismatch = mock((_u: string) => {});
    const res = await resolveClientStartup({
      trustedUrl: 'http://192.168.1.10:8080',
      pinnedServerId: 'srv-A',
      probe: probeWith('srv-B'),
      findServers: mock(async () => [server('192.168.1.10')]),
      chooseServerUrl,
      writeConfig: mock(() => {}),
      onIdentityMismatch,
    });
    expect(res).toEqual({ kind: 'not_found' });
    expect(chooseServerUrl).toHaveBeenCalledTimes(1);
    expect(onIdentityMismatch).toHaveBeenCalledWith('http://192.168.1.10:8080');
  });

  test('pinlangan id bor, server id qaytarmasa (boshqa/eski server) — mos emas deb hisoblanadi', async () => {
    const chooseServerUrl = mock(async () => null);
    await resolveClientStartup({
      trustedUrl: 'http://192.168.1.10:8080',
      pinnedServerId: 'srv-A',
      probe: probeWith(null),
      findServers: mock(async () => []),
      chooseServerUrl,
      writeConfig: mock(() => {}),
    });
    expect(chooseServerUrl).toHaveBeenCalledTimes(1);
  });

  test("eski klient (pin yo'q) — birinchi muvaffaqiyatli health'da id pinlanadi", async () => {
    const writeConfig = mock((_p: Record<string, unknown>) => {});
    const res = await resolveClientStartup({
      trustedUrl: 'http://192.168.1.10:8080',
      pinnedServerId: null,
      probe: probeWith('srv-A'),
      findServers: mock(async () => []),
      chooseServerUrl: mock(async () => null),
      writeConfig,
    });
    expect(res.kind).toBe('connected');
    expect(writeConfig).toHaveBeenCalledWith({ trustedServerId: 'srv-A' });
  });

  test('tasdiqlangan yangi server — manzil va identifikatori birga saqlanadi', async () => {
    const writeConfig = mock((_p: Record<string, unknown>) => {});
    const probe = mock(async (u: string) =>
      u === 'http://192.168.1.14:8080' ? { serverId: 'srv-C' } : null,
    );
    const res = await resolveClientStartup({
      trustedUrl: 'http://192.168.1.10:8080',
      pinnedServerId: 'srv-A',
      probe,
      findServers: mock(async () => [server('192.168.1.14')]),
      chooseServerUrl: mock(async () => 'http://192.168.1.14:8080'),
      writeConfig,
    });
    expect(res).toEqual({ kind: 'connected', url: 'http://192.168.1.14:8080' });
    expect(writeConfig).toHaveBeenCalledWith({
      serverUrl: 'http://192.168.1.14:8080',
      trustedServerId: 'srv-C',
    });
  });
});

describe('FX-145: verifyServerPin', () => {
  test('qoidalar', () => {
    expect(verifyServerPin('a', 'a')).toEqual({ ok: true, pin: 'a' });
    expect(verifyServerPin(null, 'a')).toEqual({ ok: true, pin: 'a' });
    expect(verifyServerPin(null, null)).toEqual({ ok: true, pin: null });
    expect(verifyServerPin('a', 'b')).toEqual({ ok: false });
    expect(verifyServerPin('a', null)).toEqual({ ok: false });
  });
});
