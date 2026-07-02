import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLocalStorageAdapter } from './storage.ts';

describe('createLocalStorageAdapter', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'storage-test-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  test('saves and streams a file', async () => {
    const storage = createLocalStorageAdapter(tmpDir);
    const data = Buffer.from('hello world');
    await storage.save('test/file.txt', data);
    expect(await storage.exists('test/file.txt')).toBe(true);
  });

  test('returns false for non-existent file', async () => {
    const storage = createLocalStorageAdapter(tmpDir);
    expect(await storage.exists('missing.txt')).toBe(false);
  });

  test('removes a file', async () => {
    const storage = createLocalStorageAdapter(tmpDir);
    await storage.save('to-delete.txt', Buffer.from('x'));
    await storage.remove('to-delete.txt');
    expect(await storage.exists('to-delete.txt')).toBe(false);
  });

  test('serveUrl returns correct path', () => {
    const storage = createLocalStorageAdapter(tmpDir);
    expect(storage.serveUrl('images/abc.jpg')).toBe('/uploads/images%2Fabc.jpg');
  });
});
