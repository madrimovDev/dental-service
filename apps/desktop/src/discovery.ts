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

const getLocalIp = (): string => {
  const nets = networkInterfaces();
  for (const iface of Object.values(nets)) {
    for (const net of iface ?? []) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return '127.0.0.1';
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
    const response = `${RESPONSE_PREFIX}${JSON.stringify({ ip: getLocalIp(), port: serverPort })}`;
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

export const findServer = (timeoutMs = 2500): Promise<string | null> =>
  new Promise((resolve) => {
    let resolved = false;
    const client = createSocket('udp4');

    const done = (url: string | null) => {
      if (resolved) return;
      resolved = true;
      client.close();
      resolve(url);
    };

    client.on('message', (msg) => {
      const text = msg.toString();
      if (!text.startsWith(RESPONSE_PREFIX)) return;
      const { ip, port } = JSON.parse(text.slice(RESPONSE_PREFIX.length));
      done(`http://${ip}:${port}`);
    });

    client.bind(() => {
      client.setBroadcast(true);
      client.send(DISCOVER_MSG, UDP_PORT, '255.255.255.255');
    });

    setTimeout(() => done(null), timeoutMs).unref?.();
  });
