import type { CSSVariablesResolver } from '@mantine/core';

/**
 * Mantine semantic CSS o'zgaruvchilarini clinik token'lariga bog'laydi.
 * Token'lar [data-mantine-color-scheme] orqali o'zi almashadi, shuning uchun
 * `variables` (scheme-agnostik) blokida var(--token) berish yetarli.
 */
export const cssVarsResolver: CSSVariablesResolver = () => ({
  variables: {
    // canvas / surface
    '--mantine-color-body': 'var(--bg)',
    '--mantine-color-default': 'var(--surface)',
    '--mantine-color-default-hover': 'var(--surface-2)',
    '--mantine-color-default-border': 'var(--border)',
    // text
    '--mantine-color-text': 'var(--text)',
    '--mantine-color-dimmed': 'var(--text-3)',
    '--mantine-color-placeholder': 'var(--text-3)',
    // feedback
    '--mantine-color-error': 'var(--danger)',
  },
  light: {},
  dark: {},
});
