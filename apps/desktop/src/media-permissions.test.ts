import { describe, expect, mock, test } from 'bun:test';
import {
  installMediaPermissionHandlers,
  isAllowedMediaCheck,
  isAllowedMediaRequest,
  type PermissionSessionLike,
} from './media-permissions.js';

const APP = 'http://192.168.1.10:8080/patients';

describe("isAllowedMediaRequest — faqat ilova origin'i uchun video", () => {
  const ok = {
    permission: 'media',
    requestingUrl: 'http://192.168.1.10:8080/patients/1',
    appUrl: APP,
    mediaTypes: ['video'],
    isMainFrame: true,
  };

  test("ilova origin'i + video — ruxsat", () => {
    expect(isAllowedMediaRequest(ok)).toBe(true);
  });
  test('audio (yoki video+audio) — rad (mikrofon kerak emas)', () => {
    expect(isAllowedMediaRequest({ ...ok, mediaTypes: ['audio'] })).toBe(false);
    expect(isAllowedMediaRequest({ ...ok, mediaTypes: ['video', 'audio'] })).toBe(false);
  });
  test("mediaTypes yo'q/bo'sh — rad (konservativ)", () => {
    expect(isAllowedMediaRequest({ ...ok, mediaTypes: undefined })).toBe(false);
    expect(isAllowedMediaRequest({ ...ok, mediaTypes: [] })).toBe(false);
  });
  test('boshqa origin (port/host/protokol) — rad', () => {
    expect(isAllowedMediaRequest({ ...ok, requestingUrl: 'http://192.168.1.10:9999/' })).toBe(
      false,
    );
    expect(isAllowedMediaRequest({ ...ok, requestingUrl: 'http://evil.example/' })).toBe(false);
    expect(isAllowedMediaRequest({ ...ok, requestingUrl: 'https://192.168.1.10:8080/' })).toBe(
      false,
    );
  });
  test("media bo'lmagan ruxsat — rad", () => {
    for (const p of [
      'geolocation',
      'notifications',
      'clipboard-read',
      'fullscreen',
      'openExternal',
      'display-capture',
    ]) {
      expect(isAllowedMediaRequest({ ...ok, permission: p })).toBe(false);
    }
  });
  test('iframe (asosiy freym emas) — rad', () => {
    expect(isAllowedMediaRequest({ ...ok, isMainFrame: false })).toBe(false);
  });
  test("ilova URL'i yo'q yoki yaroqsiz — rad; file:/about:blank origin — rad", () => {
    expect(isAllowedMediaRequest({ ...ok, appUrl: null })).toBe(false);
    expect(isAllowedMediaRequest({ ...ok, appUrl: 'not a url' })).toBe(false);
    expect(
      isAllowedMediaRequest({ ...ok, appUrl: 'file:///x/index.html', requestingUrl: 'file:///y' }),
    ).toBe(false);
    expect(isAllowedMediaRequest({ ...ok, requestingUrl: 'garbage' })).toBe(false);
  });
});

describe('isAllowedMediaCheck (enumerateDevices / permission check)', () => {
  test("video yoki noma'lum tur, ilova origin'i — ruxsat; audio / begona origin — rad", () => {
    expect(
      isAllowedMediaCheck({
        permission: 'media',
        requestingOrigin: 'http://192.168.1.10:8080',
        appUrl: APP,
        mediaType: 'video',
      }),
    ).toBe(true);
    expect(
      isAllowedMediaCheck({
        permission: 'media',
        requestingOrigin: 'http://192.168.1.10:8080',
        appUrl: APP,
        mediaType: 'unknown',
      }),
    ).toBe(true);
    expect(
      isAllowedMediaCheck({
        permission: 'media',
        requestingOrigin: 'http://192.168.1.10:8080',
        appUrl: APP,
        mediaType: 'audio',
      }),
    ).toBe(false);
    expect(
      isAllowedMediaCheck({
        permission: 'media',
        requestingOrigin: 'http://evil.example',
        appUrl: APP,
        mediaType: 'video',
      }),
    ).toBe(false);
    expect(
      isAllowedMediaCheck({
        permission: 'geolocation',
        requestingOrigin: 'http://192.168.1.10:8080',
        appUrl: APP,
        mediaType: 'video',
      }),
    ).toBe(false);
  });
});

describe('installMediaPermissionHandlers', () => {
  const mainContents = { id: 1 };
  const otherContents = { id: 2 };
  type ReqFn = (
    wc: unknown,
    p: string,
    cb: (g: boolean) => void,
    d: Record<string, unknown>,
  ) => void;
  type CheckFn = (wc: unknown, p: string, origin: string, d: Record<string, unknown>) => boolean;
  const setup = () => {
    const h: { req?: ReqFn; check?: CheckFn } = {};
    const ses: PermissionSessionLike = {
      setPermissionRequestHandler: (fn) => {
        h.req = fn as ReqFn;
      },
      setPermissionCheckHandler: (fn) => {
        h.check = fn as CheckFn;
      },
    };
    installMediaPermissionHandlers(ses, {
      isMainContents: (wc) => wc === mainContents,
      getAppUrl: () => APP,
    });
    return { req: h.req as ReqFn, check: h.check as CheckFn };
  };

  test("asosiy oyna + video + ilova origin'i — callback(true)", () => {
    const { req } = setup();
    const cb = mock((_g: boolean) => {});
    req(mainContents, 'media', cb, {
      requestingUrl: 'http://192.168.1.10:8080/x',
      mediaTypes: ['video'],
      isMainFrame: true,
    });
    expect(cb).toHaveBeenCalledWith(true);
  });
  test('boshqa oyna (sozlamalar/prompt) — callback(false)', () => {
    const { req } = setup();
    const cb = mock((_g: boolean) => {});
    req(otherContents, 'media', cb, {
      requestingUrl: 'http://192.168.1.10:8080/x',
      mediaTypes: ['video'],
      isMainFrame: true,
    });
    expect(cb).toHaveBeenCalledWith(false);
  });
  test("media bo'lmagan ruxsat — callback(false); handler HAR DOIM javob beradi", () => {
    const { req } = setup();
    const cb = mock((_g: boolean) => {});
    req(mainContents, 'geolocation', cb, {
      requestingUrl: 'http://192.168.1.10:8080/x',
      isMainFrame: true,
    });
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(false);
  });
  test('check handler: asosiy oyna video — true, boshqa oyna — false', () => {
    const { check } = setup();
    expect(check(mainContents, 'media', 'http://192.168.1.10:8080', { mediaType: 'video' })).toBe(
      true,
    );
    expect(check(otherContents, 'media', 'http://192.168.1.10:8080', { mediaType: 'video' })).toBe(
      false,
    );
    expect(check(mainContents, 'media', 'http://192.168.1.10:8080', { mediaType: 'audio' })).toBe(
      false,
    );
  });
});
