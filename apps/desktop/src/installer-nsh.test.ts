import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const nsh = readFileSync(join(root, 'build', 'installer.nsh'), 'utf8');
const builder = readFileSync(join(root, 'electron-builder.yml'), 'utf8');

describe('installer.nsh (P14, DT-03)', () => {
  test('existing config.json skips the role dialog', () => {
    const exists = nsh.indexOf('IfFileExists "$COMMONAPPDATA\\DentalService\\config.json"');
    const box = nsh.indexOf('MessageBox');
    expect(exists).toBeGreaterThan(-1);
    expect(box).toBeGreaterThan(-1);
    expect(exists).toBeLessThan(box);
  });

  test('firewall rules added for TCP 8080 and UDP 47890', () => {
    expect(nsh).toMatch(
      /netsh advfirewall firewall add rule[^\n]*protocol=TCP[^\n]*localport=8080/,
    );
    expect(nsh).toMatch(
      /netsh advfirewall firewall add rule[^\n]*protocol=UDP[^\n]*localport=47890/,
    );
  });

  test('uninstall removes firewall rules', () => {
    const idx = nsh.indexOf('!macro customUnInstall');
    expect(idx).toBeGreaterThan(-1);
    const body = nsh.slice(idx);
    expect(body).toContain('netsh advfirewall firewall delete rule name="Dental Service');
  });
});

describe('electron-builder.yml (DT-01)', () => {
  test('files include assets/**/*', () => {
    expect(builder).toMatch(/^\s+-\s+assets\/\*\*\/\*\s*$/m);
  });
});
