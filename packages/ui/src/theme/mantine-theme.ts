import { createTheme, type MantineColorsTuple } from '@mantine/core';

// clinik teal 50→900 (tokens.css bilan AYNAN bir xil bo'lishi shart — teal-sync.test.ts guard qiladi)
// Dental OS palette (DS0.1)
export const teal: MantineColorsTuple = [
  '#E7F6F1',
  '#C6EFE6',
  '#9CE2D3',
  '#62D2BF',
  '#2CB9A2',
  '#15A18C',
  '#0B7A6B',
  '#096154',
  '#0A4E45',
  '#0A3F38',
];

// danger red — Mantine default red (red-6 ≈ #fa5252) o'rniga token-anchored.
// primaryShade {light:6, dark:4} bo'yicha `color="red"` filled shu shadelarni oladi:
// red[6] = light --danger (tokens.css --red-600 = #CC3D3A), red[4] = dark --danger (#F26B64).
// danger-red-sync.test.ts drift'ni guard qiladi.
// Dental OS palette (DS0.1)
export const red: MantineColorsTuple = [
  '#FBE7E5',
  '#F8D2CF',
  '#F0AEA9',
  '#E88882',
  '#F26B64',
  '#DC4B47',
  '#CC3D3A',
  '#A82F2D',
  '#842523',
  '#5E1A18',
];

export const mantineTheme = createTheme({
  primaryColor: 'teal',
  // light → index 6 (#0E9384), dark → index 4 (#2FC6B2)
  primaryShade: { light: 6, dark: 4 },
  colors: { teal, red },
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
