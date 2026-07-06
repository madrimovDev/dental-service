import { describe, expect, it } from 'vitest';
import { formatNumber } from '@/lib/format';
import { renderApp } from '../../../test-utils';
import { BarMini } from './BarMini';

describe('BarMini', () => {
  it('track uses --surface-2 and default fill uses --primary (DS0 tokens)', () => {
    const { container } = renderApp(<BarMini data={[{ label: 'A', value: 50 }]} />);
    // Inspect only the inline styles authored by BarMini (not Mantine globals).
    const inlineStyles = Array.from(container.querySelectorAll<HTMLElement>('[style]'))
      .map((el) => el.getAttribute('style') ?? '')
      .join(' | ');
    expect(inlineStyles).toContain('var(--surface-2)');
    expect(inlineStyles).toContain('var(--primary)');
    // No off-token colors / no hardcoded #fff on fills
    expect(inlineStyles).not.toContain('var(--mantine-color-gray-1)');
    expect(inlineStyles).not.toContain('var(--mantine-color-blue-5)');
    expect(inlineStyles).not.toContain('#fff');
  });

  it('per-datum color overrides the default --primary fill', () => {
    const { container } = renderApp(
      <BarMini
        data={[
          { label: 'A', value: 50 },
          { label: 'B', value: 30, color: 'var(--info)' },
        ]}
      />,
    );
    const inlineStyles = Array.from(container.querySelectorAll<HTMLElement>('[style]'))
      .map((el) => el.getAttribute('style') ?? '')
      .join(' | ');
    // overridden bar uses the custom color
    expect(inlineStyles).toContain('var(--info)');
    // default bar still uses --primary
    expect(inlineStyles).toContain('var(--primary)');
  });

  it('bar width reflects value/max ratio with Math.max(2, ...) floor', () => {
    const { container } = renderApp(
      <BarMini
        data={[
          { label: 'Max', value: 200 },
          { label: 'Half', value: 100 },
          { label: 'Tiny', value: 1 },
        ]}
      />,
    );
    const widths = Array.from(container.querySelectorAll<HTMLElement>('div[style*="width"]')).map(
      (el) => el.style.width,
    );
    // 200/200 = 100%, 100/200 = 50%, 1/200 = 0.5% -> floored to 2%
    expect(widths).toContain('100%');
    expect(widths).toContain('50%');
    expect(widths).toContain('2%');
  });

  it('numeric value column uses formatNumber output', () => {
    const { container } = renderApp(<BarMini data={[{ label: 'A', value: 1234567 }]} />);
    expect(container.textContent).toContain(formatNumber(1234567));
  });
});
