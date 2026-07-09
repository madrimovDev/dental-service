import { describe, expect, test } from 'bun:test';
import {
  buildServerUrlPromptHtml,
  type PromptWindowLike,
  parsePromptTitle,
  promptServerUrl,
} from './server-url-prompt.js';

describe('parsePromptTitle (CLI-404)', () => {
  test('submit:<url> → {submit, url}', () => {
    expect(parsePromptTitle('submit:http://192.168.1.5:8000')).toEqual({
      action: 'submit',
      url: 'http://192.168.1.5:8000',
    });
  });

  test('cancel → {cancel}', () => {
    expect(parsePromptTitle('cancel')).toEqual({ action: 'cancel' });
  });

  test('boshqa title (masalan default) → null (signal emas)', () => {
    expect(parsePromptTitle('Server manzili')).toBeNull();
    expect(parsePromptTitle('')).toBeNull();
  });
});

describe('buildServerUrlPromptHtml (CLI-404)', () => {
  const html = buildServerUrlPromptHtml();
  test('input + submit/cancel handler + CSP bor, tashqi resurssiz', () => {
    expect(html).toContain('id="url"');
    expect(html).toContain("document.title = 'submit:'");
    expect(html).toContain("document.title = 'cancel'");
    expect(html).toContain('Content-Security-Policy');
    // Tashqi resurs (http/cdn) yo'q — o'zini ta'minlaydi.
    expect(html).not.toMatch(/src=["']https?:/);
  });
});

class FakeWindow implements PromptWindowLike {
  titleCb?: (e: unknown, title: string) => void;
  closedCb?: () => void;
  closed = false;
  loaded: string | null = null;
  webContents = {
    on: (_event: 'page-title-updated', cb: (e: unknown, title: string) => void) => {
      this.titleCb = cb;
    },
  };
  loadURL(url: string): void {
    this.loaded = url;
  }
  on(_event: 'closed', cb: () => void): void {
    this.closedCb = cb;
  }
  close(): void {
    this.closed = true;
  }
  isDestroyed(): boolean {
    return this.closed;
  }
  emitTitle(title: string): void {
    this.titleCb?.({}, title);
  }
  emitClosed(): void {
    this.closedCb?.();
  }
}

describe('promptServerUrl (CLI-404)', () => {
  test('submit → xom URL qaytaradi va oynani yopadi', async () => {
    const win = new FakeWindow();
    const p = promptServerUrl(() => win);
    win.emitTitle('submit:http://192.168.1.5:8000');
    expect(await p).toBe('http://192.168.1.5:8000');
    expect(win.closed).toBe(true);
    expect(win.loaded).toContain('data:text/html');
  });

  test('cancel → null', async () => {
    const win = new FakeWindow();
    const p = promptServerUrl(() => win);
    win.emitTitle('cancel');
    expect(await p).toBeNull();
    expect(win.closed).toBe(true);
  });

  test('oyna yopilsa (X) → null', async () => {
    const win = new FakeWindow();
    const p = promptServerUrl(() => win);
    win.emitClosed();
    expect(await p).toBeNull();
  });

  test('submitdan keyingi ikkinchi signal e’tiborsiz (bir marta settle)', async () => {
    const win = new FakeWindow();
    const p = promptServerUrl(() => win);
    win.emitTitle('submit:http://10.0.0.5:8000');
    win.emitTitle('cancel');
    expect(await p).toBe('http://10.0.0.5:8000');
  });
});
