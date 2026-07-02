/**
 * Yagona sinovlararo 'electron' mock (test-infra, ishlab chiqarish kodi
 * emas). `bun test` bitta process ichida barcha `*.test.ts` fayllarni
 * yuklaydi va `mock.module('electron', ...)` global modul registrini
 * o'zgartiradi — agar har fayl o'z alohida (turli shakldagi) mock'ini
 * ro'yxatdan o'tkazsa, qaysi biri "oxirgi" bo'lib qolishi fayllar orasidagi
 * yuklash tartibiga (racy) bog'liq bo'lib qoladi (masalan `tray.ts`
 * `Tray`/`Menu` kerak, `first-run.ts`/`process-manager.ts` faqat `app`
 * kerak — kim g'olib chiqishi tasodifiy).
 *
 * Yechim: BITTA umumiy factory — har `*.test.ts` fayl shu modulni
 * side-effect uchun import qiladi (`import './test-electron-mock'`), shu
 * sababli qaysi fayl "oxirgi" bo'lib ro'yxatdan o'tkazsa ham natija bir xil.
 */
import { mock } from 'bun:test';

export interface MockMenuItem {
  label?: string;
  enabled?: boolean;
  type?: string;
  click?: () => void;
}

export const trayMockState: {
  setToolTipCalls: string[];
  setContextMenuCalls: MockMenuItem[][];
  lastMenuTemplate: MockMenuItem[] | null;
} = {
  setToolTipCalls: [],
  setContextMenuCalls: [],
  lastMenuTemplate: null,
};

export const resetTrayMockState = (): void => {
  trayMockState.setToolTipCalls = [];
  trayMockState.setContextMenuCalls = [];
  trayMockState.lastMenuTemplate = null;
};

class FakeTray {
  setToolTip(text: string): void {
    trayMockState.setToolTipCalls.push(text);
  }
  setContextMenu(menu: MockMenuItem[]): void {
    trayMockState.setContextMenuCalls.push(menu);
  }
}

export const shellOpenExternalMock = mock(async (_url: string) => {});

mock.module('electron', () => ({
  app: { isPackaged: false },
  Tray: FakeTray,
  Menu: {
    buildFromTemplate: (template: MockMenuItem[]) => {
      trayMockState.lastMenuTemplate = template;
      return template;
    },
  },
  shell: { openExternal: shellOpenExternalMock },
  nativeImage: { createFromPath: (_path: string) => ({}) },
}));
