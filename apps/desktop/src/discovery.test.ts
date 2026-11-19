import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { EventEmitter } from 'node:events';

// 'node:dgram' va '@homebridge/ciao' mock qilinadi — mock.module BEFORE any
// dynamic import of './discovery' resolves it (process-manager.test.ts
// pattern). Real UDP/mDNS ishlatilmaydi — deterministik, sandbox-xavfsiz.
class FakeSocket extends EventEmitter {
  bound = false;
  broadcast = false;
  closed = false;
  sentMessages: Array<{ msg: string; port: number; address: string }> = [];

  bind(portOrCb: number | (() => void), cb?: () => void) {
    this.bound = true;
    if (typeof portOrCb === 'function') {
      portOrCb();
    } else {
      cb?.();
    }
  }

  setBroadcast(value: boolean) {
    this.broadcast = value;
  }

  send(msg: string, port: number, address: string) {
    this.sentMessages.push({ msg, port, address });
  }

  close() {
    this.closed = true;
  }
}

let createdSockets: FakeSocket[] = [];

mock.module('node:dgram', () => ({
  createSocket: () => {
    const socket = new FakeSocket();
    createdSockets.push(socket);
    return socket;
  },
}));

let ciaoServiceCalls: Array<Record<string, unknown>> = [];
let ciaoAdvertised = false;
let ciaoEnded = false;

mock.module('@homebridge/ciao', () => ({
  default: {
    getResponder: () => ({
      createService: (opts: Record<string, unknown>) => {
        ciaoServiceCalls.push(opts);
        return {
          advertise: async () => {
            ciaoAdvertised = true;
          },
          end: async () => {
            ciaoEnded = true;
          },
        };
      },
    }),
  },
}));

const { startServerDiscovery, stopServerDiscovery, findServers, pickLocalIpFor } = await import(
  './discovery.js'
);

describe('discovery', () => {
  beforeEach(() => {
    createdSockets = [];
    ciaoServiceCalls = [];
    ciaoAdvertised = false;
    ciaoEnded = false;
  });

  test("startServerDiscovery mDNS xizmatini e'lon qiladi va UDP 47890 portda tinglaydi", () => {
    startServerDiscovery(8080);

    expect(ciaoServiceCalls).toHaveLength(1);
    expect(ciaoServiceCalls[0]).toMatchObject({ port: 8080 });
    expect(ciaoAdvertised).toBe(true);
    expect(createdSockets).toHaveLength(1);
    expect(createdSockets[0]?.bound).toBe(true);
    expect(createdSockets[0]?.broadcast).toBe(true);

    stopServerDiscovery();
  });

  test('UDP DISCOVER xabariga ip+port bilan javob yuboradi', () => {
    startServerDiscovery(8080);
    const serverSocket = createdSockets[0];
    if (!serverSocket) throw new Error('server socket yaratilmadi');

    serverSocket.emit('message', Buffer.from('DENTAL_DISCOVER_v1'), {
      port: 12345,
      address: '10.0.0.5',
    });

    expect(serverSocket.sentMessages).toHaveLength(1);
    const sent = serverSocket.sentMessages[0];
    if (!sent) throw new Error('javob yuborilmadi');
    expect(sent.port).toBe(12345);
    expect(sent.address).toBe('10.0.0.5');
    expect(sent.msg.startsWith('DENTAL_SERVER_v1:')).toBe(true);

    const payload = JSON.parse(sent.msg.slice('DENTAL_SERVER_v1:'.length));
    expect(payload.port).toBe(8080);

    stopServerDiscovery();
  });

  test('notanish xabarga javob yubormaydi', () => {
    startServerDiscovery(8080);
    const serverSocket = createdSockets[0];
    if (!serverSocket) throw new Error('server socket yaratilmadi');

    serverSocket.emit('message', Buffer.from('SOME_OTHER_MSG'), {
      port: 12345,
      address: '10.0.0.5',
    });

    expect(serverSocket.sentMessages).toHaveLength(0);

    stopServerDiscovery();
  });

  test('stopServerDiscovery mDNS xizmatini va UDP socketni tugatadi', () => {
    startServerDiscovery(8080);
    stopServerDiscovery();

    expect(ciaoEnded).toBe(true);
    expect(createdSockets[0]?.closed).toBe(true);
  });

  test('findServers javob kelsa — barcha topilgan serverlarni massiv sifatida qaytaradi (timeout tugagach)', async () => {
    const promise = findServers(20);
    const clientSocket = createdSockets[0];
    if (!clientSocket) throw new Error('client socket yaratilmadi');

    expect(clientSocket.broadcast).toBe(true);
    expect(clientSocket.sentMessages[0]?.msg).toBe('DENTAL_DISCOVER_v1');

    clientSocket.emit(
      'message',
      Buffer.from(`DENTAL_SERVER_v1:${JSON.stringify({ ip: '10.0.0.9', port: 8080 })}`),
      { address: '10.0.0.9', port: 47890 },
    );

    const servers = await promise;
    expect(servers).toEqual([{ url: 'http://10.0.0.9:8080', ip: '10.0.0.9', port: 8080 }]);
    expect(clientSocket.closed).toBe(true);
  });

  // CLI-434 — the exact evil-twin fix: does NOT jump on the first response.
  // Both a legitimate server and a rogue LAN device answering must both end
  // up in the array so the caller can present them to the user for
  // confirmation instead of silently trusting whichever answered first.
  test('findServers ikkita javob kelsa — ikkalasi ham massivda (birinchisiga sakramaydi, evil-twin fix)', async () => {
    const promise = findServers(20);
    const clientSocket = createdSockets[0];
    if (!clientSocket) throw new Error('client socket yaratilmadi');

    clientSocket.emit(
      'message',
      Buffer.from(`DENTAL_SERVER_v1:${JSON.stringify({ ip: '10.0.0.9', port: 8080 })}`),
      { address: '10.0.0.9', port: 47890 },
    );
    clientSocket.emit(
      'message',
      Buffer.from(`DENTAL_SERVER_v1:${JSON.stringify({ ip: '10.0.0.66', port: 8080 })}`),
      { address: '10.0.0.66', port: 47890 },
    );

    const servers = await promise;
    expect(servers).toHaveLength(2);
    expect(servers.map((s) => s.url).sort()).toEqual(
      ['http://10.0.0.66:8080', 'http://10.0.0.9:8080'].sort(),
    );
  });

  test('findServers bir xil serverdan takroriy javob kelsa — dedupe qiladi (bitta yozuv)', async () => {
    const promise = findServers(20);
    const clientSocket = createdSockets[0];
    if (!clientSocket) throw new Error('client socket yaratilmadi');

    const msg = Buffer.from(`DENTAL_SERVER_v1:${JSON.stringify({ ip: '10.0.0.9', port: 8080 })}`);
    clientSocket.emit('message', msg, { address: '10.0.0.9', port: 47890 });
    clientSocket.emit('message', msg, { address: '10.0.0.9', port: 47890 });

    const servers = await promise;
    expect(servers).toHaveLength(1);
  });

  test("findServers javob kelmasa timeout tugagach bo'sh massiv qaytaradi", async () => {
    const servers = await findServers(20);
    expect(servers).toEqual([]);
  });

  // FX-104 (LB-13) — server JSON'da virtual/VPN adapter IP'sini yuborishi mumkin
  // (vEthernet 172.x, VirtualBox 192.168.56.1); javob paketi esa haqiqiy LAN
  // IP'dan keladi. Klient manzilni JSON'dagi `ip`dan emas, `rinfo.address`dan
  // quradi — saqlanadigan manzil aynan javob kelgan interfeys bo'ladi.
  test('FX-104: findServers JSON ichidagi ip emas, javob kelgan manzil (rinfo.address) bilan URL quradi', async () => {
    const promise = findServers(20);
    const clientSocket = createdSockets[0];
    if (!clientSocket) throw new Error('client socket yaratilmadi');

    clientSocket.emit(
      'message',
      Buffer.from(`DENTAL_SERVER_v1:${JSON.stringify({ ip: '172.20.0.1', port: 8080 })}`),
      { address: '192.168.1.10', port: 47890 },
    );

    const servers = await promise;
    expect(servers).toEqual([{ url: 'http://192.168.1.10:8080', ip: '192.168.1.10', port: 8080 }]);
  });

  test("FX-104: yaroqsiz port bo'lsa javob e'tiborsiz qoldiriladi", async () => {
    const promise = findServers(20);
    const clientSocket = createdSockets[0];
    if (!clientSocket) throw new Error('client socket yaratilmadi');

    clientSocket.emit(
      'message',
      Buffer.from(`DENTAL_SERVER_v1:${JSON.stringify({ ip: '10.0.0.9', port: 'x' })}`),
      { address: '10.0.0.9', port: 47890 },
    );

    expect(await promise).toEqual([]);
  });
});

describe('FX-104: pickLocalIpFor (server javobidagi ip)', () => {
  const nets = {
    'vEthernet (WSL)': [
      { address: '172.20.0.1', netmask: '255.255.240.0', family: 'IPv4', internal: false },
    ],
    'Ethernet 2': [
      { address: '169.254.10.20', netmask: '255.255.0.0', family: 'IPv4', internal: false },
    ],
    Ethernet: [
      { address: 'fe80::1', netmask: 'ffff:ffff:ffff:ffff::', family: 'IPv6', internal: false },
      { address: '192.168.1.10', netmask: '255.255.255.0', family: 'IPv4', internal: false },
    ],
    Loopback: [{ address: '127.0.0.1', netmask: '255.0.0.0', family: 'IPv4', internal: true }],
  };

  test("so'rov kelgan manzil bilan bir subnetdagi interfeysni tanlaydi (ro'yxatdagi birinchisini emas)", () => {
    expect(pickLocalIpFor('192.168.1.33', nets)).toBe('192.168.1.10');
  });

  test("mos subnet bo'lmasa — link-local (169.254/16) emas, birinchi oddiy tashqi IPv4", () => {
    const onlyLinkLocalFirst = { 'Ethernet 2': nets['Ethernet 2'], Ethernet: nets.Ethernet };
    expect(pickLocalIpFor('10.9.9.9', onlyLinkLocalFirst)).toBe('192.168.1.10');
  });

  test("hech qanday tashqi IPv4 bo'lmasa 127.0.0.1", () => {
    expect(pickLocalIpFor('10.9.9.9', { Loopback: nets.Loopback })).toBe('127.0.0.1');
  });
});
