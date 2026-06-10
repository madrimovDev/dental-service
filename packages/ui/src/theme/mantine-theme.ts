import { createTheme, type MantineColorsTuple } from '@mantine/core';

// clinik teal 50→900 (tokens.css bilan AYNAN bir xil bo'lishi shart)
const teal: MantineColorsTuple = [
  '#E9F8F4',
  '#C9F0E7',
  '#9FE4D5',
  '#6FD7C7',
  '#2FC6B2',
  '#14B8A6',
  '#0E9384',
  '#0B7268',
  '#0A5A52',
  '#0A4A44',
];

export const mantineTheme = createTheme({
  primaryColor: 'teal',
  // light → index 6 (#0E9384), dark → index 4 (#2FC6B2)
  primaryShade: { light: 6, dark: 4 },
  colors: { teal },
  fontFamily: 'var(--font-sans)',
  fontFamilyMonospace: 'var(--font-mono)',
  headings: { fontFamily: 'var(--font-sans)', fontWeight: '600' },
  defaultRadius: 'md',
  // Mantine radius shkalasi → token var'lar (drift yo'q).
  // 'md' = token --radius (8px). Primitiv CSS Module kerak joyda
  // to'g'ridan var(--radius-md) (9px) ishlatadi.
  radius: {
    xs: 'var(--radius-xs)',
    sm: 'var(--radius-sm)',
    md: 'var(--radius)',
    lg: 'var(--radius-lg)',
    xl: 'var(--radius-xl)',
  },
  shadows: {
    xs: 'var(--shadow-sm)',
    sm: 'var(--shadow-sm)',
    md: 'var(--shadow)',
    lg: 'var(--shadow-lg)',
    xl: 'var(--shadow-lg)',
  },
});
