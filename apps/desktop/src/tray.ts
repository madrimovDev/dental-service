/**
 * Tray menu — Server/Klient rejimida tizim tepsisi (system tray) ikonkasi
 * va kontekst menyusi (CLI-348, Task 9).
 *
 * Server: URL + ulangan qurilmalar soni + litsenziya holati ko'rsatiladi.
 * Klient: ulangan server manzili ko'rsatiladi.
 */

import { join } from 'node:path';
import { Menu, nativeImage, Tray } from 'electron';
import type { AppRole } from './config';

export interface TrayInfo {
  serverUrl: string;
  connectedClients?: number;
  licenseInfo?: string;
  // Klient rolida `false` — LAN discovery serverni topa olmadi (fon retry
  // davom etmoqda, CLI-348 qaror 4). `undefined`/`true` — ulangan holat.
  serverFound?: boolean;
}

export interface TrayCallbacks {
  onOpen: () => void;
  onSettings: () => void;
  onStop: () => void;
}

let tray: Tray | null = null;

export const createTray = (role: AppRole, info: TrayInfo, callbacks: TrayCallbacks): void => {
  const iconPath = join(import.meta.dirname, '..', 'assets', 'tray-icon.png');
  tray = new Tray(nativeImage.createFromPath(iconPath));
  tray.setToolTip('Dental Service');
  updateTray(role, info, callbacks);
};

// Auto-updater (CLI-357, Task 12) tray ikonkasiga tegishli — tray instansiyasi
// bu modulda inkapsulyatsiya qilingani sababli tashqaridan tooltip yangilash
// shu eksport orqali amalga oshadi (`main.ts` `Tray` obyektiga bevosita
// kirmaydi).
export const setTrayToolTip = (text: string): void => {
  tray?.setToolTip(text);
};

export const updateTray = (role: AppRole, info: TrayInfo, callbacks: TrayCallbacks): void => {
  const label =
    role === 'server'
      ? `Dental Service — Server\n📡 ${info.serverUrl}\n👥 ${info.connectedClients ?? 0} ta qurilma${info.licenseInfo ? `\n🔐 ${info.licenseInfo}` : ''}`
      : info.serverFound === false
        ? 'Dental Service — Klient\n🔍 Server topilmadi (30s da qayta urinilmoqda)'
        : `Dental Service — Klient\n✅ Ulangan: ${info.serverUrl}`;

  const menu = Menu.buildFromTemplate([
    { label, enabled: false },
    { type: 'separator' },
    { label: '🌐 Ochish', click: callbacks.onOpen },
    { label: '⚙️  Sozlamalar', click: callbacks.onSettings },
    { type: 'separator' },
    { label: role === 'server' ? "🔴 To'xtatish" : '❌ Chiqish', click: callbacks.onStop },
  ]);
  tray?.setContextMenu(menu);
};
