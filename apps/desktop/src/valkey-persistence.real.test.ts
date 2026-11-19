/**
 * FX-96 (LB-05) — real `valkey-server` bilan: desktop Valkey qayta ishga
 * tushganda (crash / kompyuter o'chishi — SIGKILL) navbat ma'lumoti saqlanadi.
 * `valkey-server` PATH'da bo'lmasa test o'tkazib yuboriladi.
 */
import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildValkeyArgs, getValkeyDataDir } from './valkey-args.js';

const BIN = Bun.which('valkey-server');
const CONF = join(import.meta.dir, '..', '..', '..', 'infra', 'valkey-linux.conf');

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const cli = async (port: number, ...args: string[]): Promise<string> => {
  const p = Bun.spawn([Bun.which('valkey-cli') ?? 'valkey-cli', '-p', String(port), ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const out = await new Response(p.stdout).text();
  await p.exited;
  return out.trim();
};

const waitReady = async (port: number) => {
  for (let i = 0; i < 100; i++) {
    if ((await cli(port, 'PING')) === 'PONG') return;
    await sleep(50);
  }
  throw new Error('valkey not ready');
};

let dir: string | null = null;
const procs: Bun.Subprocess[] = [];

afterEach(() => {
  for (const p of procs) p.kill('SIGKILL');
  procs.length = 0;
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = null;
});

describe.skipIf(!BIN)('FX-96: desktop Valkey doimiyligi (real valkey-server)', () => {
  test("SIGKILL'dan keyin qayta ishga tushganda kechiktirilgan job kaliti saqlanadi", async () => {
    dir = mkdtempSync(join(tmpdir(), 'fx96-valkey-'));
    mkdirSync(getValkeyDataDir(dir), { recursive: true }); // process-manager spawnValkey bilan bir xil
    const port = 20000 + Math.floor(Math.random() * 20000);
    // Desktop'da cwd = Electron o'rnatish papkasi; testda ham cwd'ni dataDir'dan
    // boshqa joyga qo'yamiz — `dir` faqat argumentlardan kelishi kerak.
    const cwd = mkdtempSync(join(tmpdir(), 'fx96-cwd-'));
    const spawn = () => {
      const p = Bun.spawn(
        [BIN as string, ...buildValkeyArgs(CONF, dir as string), '--port', String(port)],
        {
          cwd,
          stdout: 'ignore',
          stderr: 'ignore',
        },
      );
      procs.push(p);
      return p;
    };

    const first = spawn();
    await waitReady(port);
    expect(await cli(port, 'ZADD', 'bull:appointment-reminder:delayed', '1', 'appointment-x')).toBe(
      '1',
    );
    // appendfsync everysec — 1 s ichida diskka tushadi.
    await sleep(1500);
    first.kill('SIGKILL');
    await first.exited;

    spawn();
    await waitReady(port);
    expect(await cli(port, 'ZCARD', 'bull:appointment-reminder:delayed')).toBe('1');
    rmSync(cwd, { recursive: true, force: true });
  }, 20000);
});
