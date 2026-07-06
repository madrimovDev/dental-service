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

const { startServerDiscovery, stopServerDiscovery, findServer } = await import('./discovery.js');

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

  test('findServer javob kelsa server URL bilan resolve qiladi', async () => {
    const promise = findServer(1000);
    const clientSocket = createdSockets[0];
    if (!clientSocket) throw new Error('client socket yaratilmadi');

    expect(clientSocket.broadcast).toBe(true);
    expect(clientSocket.sentMessages[0]?.msg).toBe('DENTAL_DISCOVER_v1');

    clientSocket.emit(
      'message',
      Buffer.from(`DENTAL_SERVER_v1:${JSON.stringify({ ip: '10.0.0.9', port: 8080 })}`),
    );

    const url = await promise;
    expect(url).toBe('http://10.0.0.9:8080');
    expect(clientSocket.closed).toBe(true);
  });

  test('findServer javob kelmasa timeout tugagach null qaytaradi', async () => {
    const url = await findServer(20);
    expect(url).toBeNull();
  });
});
