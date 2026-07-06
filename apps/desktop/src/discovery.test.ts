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

const { startServerDiscovery, stopServerDiscovery, findServers } = await import('./discovery.js');

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
    );
    clientSocket.emit(
      'message',
      Buffer.from(`DENTAL_SERVER_v1:${JSON.stringify({ ip: '10.0.0.66', port: 8080 })}`),
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
    clientSocket.emit('message', msg);
    clientSocket.emit('message', msg);

    const servers = await promise;
    expect(servers).toHaveLength(1);
  });

  test("findServers javob kelmasa timeout tugagach bo'sh massiv qaytaradi", async () => {
    const servers = await findServers(20);
    expect(servers).toEqual([]);
  });
});
