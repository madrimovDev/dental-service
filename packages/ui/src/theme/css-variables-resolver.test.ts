import { describe, expect, it } from 'vitest';
import { cssVarsResolver } from './css-variables-resolver';
import { mantineTheme } from './mantine-theme';

describe('cssVarsResolver', () => {
  it("Mantine body/text/border var'larini token'larga bog'laydi", () => {
    const out = cssVarsResolver(mantineTheme as Parameters<typeof cssVarsResolver>[0]);
    expect(out.variables['--mantine-color-body']).toBe('var(--bg)');
    expect(out.variables['--mantine-color-text']).toBe('var(--text)');
    expect(out.variables['--mantine-color-default-border']).toBe('var(--border)');
    expect(out.variables['--mantine-color-default']).toBe('var(--surface)');
    expect(out.variables['--mantine-color-error']).toBe('var(--danger)');
  });
});
