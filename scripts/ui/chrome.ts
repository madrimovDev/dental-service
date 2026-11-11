import { readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

/** `~/.cache/ms-playwright/chromium-*` ichidagi eng yangi Chromium yo'li. */
export function findChromePath(): string {
  const base = resolve(homedir(), '.cache/ms-playwright');
  const dir = readdirSync(base)
    .filter((d) => d.startsWith('chromium-'))
    .sort()
    .pop();
  if (!dir) throw new Error('chromium topilmadi (~/.cache/ms-playwright)');
  return resolve(base, dir, 'chrome-linux64/chrome');
}
