import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderUI } from '../../test-utils';
import { StatusPill } from './StatusPill';

describe('StatusPill', () => {
  it("matn va status data-atributini qo'yadi", () => {
    renderUI(<StatusPill status="success">Tugadi</StatusPill>);
    const el = screen.getByText('Tugadi');
    expect(el.closest('[data-status="success"]')).not.toBeNull();
  });

  it("dot=false bo'lsa nuqta render qilmaydi", () => {
    const { container } = renderUI(
      <StatusPill status="info" dot={false}>
        Qabulda
      </StatusPill>,
    );
    expect(container.querySelector('[data-pill-dot]')).toBeNull();
  });
});

describe("StatusPill — 6 ma'no lug'ati (UI-0 1.2)", () => {
  const meanings = ['planned', 'confirmed', 'waiting', 'active', 'done', 'failed'] as const;

  it.each(meanings)("'%s' ma'nosi yorliq + data-meaning + nuqta bilan chiqadi", (m) => {
    const { container } = renderUI(<StatusPill status={m}>Yorliq-{m}</StatusPill>);
    const el = screen.getByText(`Yorliq-${m}`).closest('[data-meaning]');
    expect(el?.getAttribute('data-meaning')).toBe(m);
    expect(container.querySelector('[data-pill-dot]')).not.toBeNull();
  });

  it.each([
    ['info', 'planned'],
    ['success', 'confirmed'],
    ['warning', 'waiting'],
    ['accent', 'active'],
    ['neutral', 'done'],
    ['danger', 'failed'],
  ] as const)("eski '%s' varianti '%s' ma'nosiga map qilinadi", (legacy, meaning) => {
    renderUI(<StatusPill status={legacy}>X-{legacy}</StatusPill>);
    const el = screen.getByText(`X-${legacy}`).closest('[data-meaning]');
    expect(el?.getAttribute('data-meaning')).toBe(meaning);
    expect(el?.getAttribute('data-status')).toBe(legacy);
  });

  it("standart (status berilmasa) 'done' ma'nosi", () => {
    renderUI(<StatusPill>Bo'sh</StatusPill>);
    expect(screen.getByText("Bo'sh").closest('[data-meaning]')?.getAttribute('data-meaning')).toBe(
      'done',
    );
  });
});

describe('StatusPill CSS — ranglar token orqali', () => {
  it("har ma'no --st-<ma'no>-bg/fg tokenlarini ishlatadi", async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const css = readFileSync(
      resolve(process.cwd(), 'src/primitives/StatusPill/StatusPill.module.css'),
      'utf8',
    );
    for (const m of ['planned', 'confirmed', 'waiting', 'active', 'done', 'failed']) {
      expect(css).toContain(`data-meaning="${m}"`);
      expect(css).toContain(`--st-${m}-bg`);
      expect(css).toContain(`--st-${m}-fg`);
    }
  });
});
