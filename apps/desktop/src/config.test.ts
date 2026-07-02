import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readConfig, writeConfig } from './config';

describe('readConfig / writeConfig', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'config-test-'));
    process.env.DENTAL_CONFIG_DIR = tmpDir;
  });

  afterEach(async () => {
    delete process.env.DENTAL_CONFIG_DIR;
    await rm(tmpDir, { recursive: true, force: true });
  });

  test('returns default config if file missing', () => {
    const cfg = readConfig();
    expect(cfg.role).toBe('server');
    expect(cfg.serverPort).toBe(80);
    expect(cfg.serverUrl).toBeNull();
    expect(cfg.licenseKey).toBeNull();
  });

  test('reads saved config after writeConfig (round-trip)', () => {
    writeConfig({ role: 'client', serverUrl: 'http://10.0.0.1' });
    const cfg = readConfig();
    expect(cfg.role).toBe('client');
    expect(cfg.serverUrl).toBe('http://10.0.0.1');
  });

  test('merges partial writes with existing config', () => {
    writeConfig({ licenseKey: 'KEY-1' });
    writeConfig({ role: 'client' });
    const cfg = readConfig();
    expect(cfg.licenseKey).toBe('KEY-1');
    expect(cfg.role).toBe('client');
  });
});
