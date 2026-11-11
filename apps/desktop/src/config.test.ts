import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readConfig, resolveLabHubUrl, writeConfig } from './config.js';

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
    expect(cfg.serverPort).toBe(8080);
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

  test('preserves existing serverPort and licenseKey', () => {
    writeConfig({ serverPort: 9090, licenseKey: 'KEY-9' });
    const cfg = readConfig();
    expect(cfg.serverPort).toBe(9090);
    expect(cfg.licenseKey).toBe('KEY-9');
  });
});

describe('labHubUrl (laboratoriya portali)', () => {
  test('default bo‘sh — integratsiya o‘chiq', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'config-test-'));
    process.env.DENTAL_CONFIG_DIR = dir;
    try {
      expect(readConfig().labHubUrl).toBe('');
      expect(resolveLabHubUrl(readConfig())).toBe('');
      writeConfig({ labHubUrl: 'https://hub.example.uz/' });
      expect(resolveLabHubUrl(readConfig())).toBe('https://hub.example.uz');
    } finally {
      delete process.env.DENTAL_CONFIG_DIR;
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('faqat http(s) manzil; noto‘g‘ri qiymat → o‘chiq', () => {
    expect(resolveLabHubUrl({ labHubUrl: '  http://10.0.0.5:8090  ' })).toBe(
      'http://10.0.0.5:8090',
    );
    expect(resolveLabHubUrl({ labHubUrl: 'file:///etc/passwd' })).toBe('');
    expect(resolveLabHubUrl({ labHubUrl: 'not a url' })).toBe('');
    expect(resolveLabHubUrl({ labHubUrl: undefined as unknown as string })).toBe('');
  });
});
