/**
 * LAN discovery — Server rejimi o'zini mDNS orqali e'lon qiladi va UDP
 * broadcast so'roviga javob beradi; Client rejimi UDP broadcast yuborib
 * serverni topadi (CLI-347, Task 8).
 *
 * mDNS (`@homebridge/ciao`) — standart discovery yo'li. UDP broadcast —
 * ba'zi Windows tarmoq konfiguratsiyalarida mDNS multicast bloklanishi
 * mumkin bo'lgani uchun ishonchli fallback (brainstorm qarori: har
 * doim ikkalasi ham ishga tushiriladi, client faqat UDP javobiga tayanadi).
 */
import { createSocket } from 'node:dgram';
import { networkInterfaces } from 'node:os';
import ciao from '@homebridge/ciao';

const UDP_PORT = 47890;
const DISCOVER_MSG = 'DENTAL_DISCOVER_v1';
const RESPONSE_PREFIX = 'DENTAL_SERVER_v1:';

interface AdvertisedService {
  end(): Promise<void>;
}

let advertisedService: AdvertisedService | null = null;
let udpServer: ReturnType<typeof createSocket> | null = null;

// ---- SERVER SIDE ----

type NetsLike = Record<
  string,
  | ReadonlyArray<{ address: string; netmask: string; family: string | number; internal: boolean }>
  | undefined
>;

const ipv4ToInt = (ip: string): number | null => {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const v = Number(p);
    if (!/^\d{1,3}$/.test(p) || v > 255) return null;
    n = n * 256 + v;
  }
  return n;
};

const isLinkLocal = (ip: string): boolean => ip.startsWith('169.254.');

/**
 * FX-104 (LB-13) — javobdagi `ip` uchun lokal interfeysni tanlaydi: avval
 * so'rov kelgan manzil (`remoteAddress`) bilan BIR subnetdagi IPv4 interfeys;
 * bo'lmasa link-local (169.254/16, DHCP'siz adapter) bo'lmagan birinchi
 * tashqi IPv4. Ilgari `networkInterfaces()` ro'yxatidagi birinchi tashqi IPv4
 * qaytarilardi — Windows'da virtual/VPN adapter (Hyper-V, VirtualBox, Radmin)
 * Ethernet'dan oldin turishi mumkin. Sof funksiya (`nets` inject qilinadi).
 * Klient baribir `rinfo.address`ga tayanadi (`findServers`) — bu faqat
 * eski klientlar uchun to'g'ri `ip` yuborish.
 */
export const pickLocalIpFor = (remoteAddress: string, nets: NetsLike): string => {
  const candidates: Array<{ address: string; netmask: string }> = [];
  for (const iface of Object.values(nets)) {
    for (const net of iface ?? []) {
      const isV4 = net.family === 'IPv4' || net.family === 4;
      if (isV4 && !net.internal) candidates.push({ address: net.address, netmask: net.netmask });
    }
  }
  const remote = ipv4ToInt(remoteAddress);
  if (remote !== null) {
    for (const c of candidates) {
      const addr = ipv4ToInt(c.address);
      const mask = ipv4ToInt(c.netmask);
      if (addr === null || mask === null || mask === 0) continue;
      // `>>> 0` — 32-bit unsigned (JS bit operatorlari signed int32 beradi).
      if ((addr & mask) >>> 0 === (remote & mask) >>> 0) return c.address;
    }
  }
  const usable = candidates.find((c) => !isLinkLocal(c.address));
  return usable?.address ?? '127.0.0.1';
};

export const startServerDiscovery = (serverPort: number): void => {
  // mDNS e'lon
  const responder = ciao.getResponder();
  const service = responder.createService({
    name: 'Dental Service',
    type: 'dental-service',
    port: serverPort,
  });
  service.advertise().catch(() => {
    // mDNS advertise muvaffaqiyatsiz bo'lsa ham UDP fallback ishlayveradi.
  });
  advertisedService = service;

  // UDP broadcast listener
  const server = createSocket('udp4');
  udpServer = server;
  server.bind(UDP_PORT, () => {
    server.setBroadcast(true);
  });
  server.on('message', (msg, rinfo) => {
    if (msg.toString() !== DISCOVER_MSG) return;
    const response = `${RESPONSE_PREFIX}${JSON.stringify({ ip: pickLocalIpFor(rinfo.address, networkInterfaces()), port: serverPort })}`;
    server.send(response, rinfo.port, rinfo.address);
  });
};

export const stopServerDiscovery = (): void => {
  advertisedService?.end().catch(() => {});
  advertisedService = null;
  udpServer?.close();
  udpServer = null;
};

// ---- CLIENT SIDE ----

export interface DiscoveredServer {
  url: string;
  ip: string;
  port: number;
}

/**
 * CLI-434 — evil-twin fix (a). Ilgari `findServer` BIRINCHI kelgan
 * `DENTAL_SERVER_v1:` javobiga jim ishonardi (auth/tasdiqlashsiz) — LAN'dagi
 * istalgan qurilma soxta javob yuborib klientni o'ziga yo'naltirishi mumkin
 * edi. `findServers` `timeoutMs` davomida BARCHA javoblarni yig'adi (unikal,
 * url bo'yicha dedupe) va massiv qaytaradi — birinchisiga sakramaydi.
 * Chaqiruvchi (`main.ts`) foydalanuvchiga topilgan server(lar)ni ko'rsatib
 * TASDIQLASHNI so'raydi (TOFU — bir marta tasdiqlangach `config.serverUrl`ga
 * yoziladi, keyingi startup'lar qayta so'ramaydi). Bo'sh massiv = topilmadi.
 */
export const findServers = (timeoutMs = 2500): Promise<DiscoveredServer[]> =>
  new Promise((resolve) => {
    const client = createSocket('udp4');
    const found = new Map<string, DiscoveredServer>();

    client.on('message', (msg, rinfo) => {
      const text = msg.toString();
      if (!text.startsWith(RESPONSE_PREFIX)) return;
      try {
        const { port } = JSON.parse(text.slice(RESPONSE_PREFIX.length));
        if (!Number.isInteger(port) || port < 1 || port > 65535) return;
        // FX-104 (LB-13) — manzil JSON'dagi `ip`dan EMAS, javob paketi kelgan
        // manzildan (`rinfo.address`) olinadi: server virtual/VPN adapter
        // IP'sini yuborgan bo'lsa ham klient aynan yetib boradigan manzilni
        // saqlaydi.
        const ip = rinfo.address;
        const url = `http://${ip}:${port}`;
        if (!found.has(url)) found.set(url, { url, ip, port });
      } catch {
        // Buzuq/notanish javob — e'tiborsiz qoldiramiz (parse xatosi bilan
        // butun discovery'ni yiqitmaymiz).
      }
    });

    client.bind(() => {
      client.setBroadcast(true);
      client.send(DISCOVER_MSG, UDP_PORT, '255.255.255.255');
    });

    setTimeout(() => {
      client.close();
      resolve(Array.from(found.values()));
    }, timeoutMs).unref?.();
  });
