import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CurrentTimeLine } from './CurrentTimeLine';

// Asia/Tashkent = UTC+5. 08:00–20:00 local oyna.
describe('CurrentTimeLine — window + offset (Dental OS spec §6.1)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function freezeUtc(iso: string) {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(iso));
  }

  it("oyna ichida (10:00 local) → ko'rinadi, top = 176px (120min × 88/60)", () => {
    // 05:00Z = 10:00 Tashkent → 600 min; dayStart 480 → (600-480)=120 → 176px
    freezeUtc('2026-06-10T05:00:00Z');
    const { getByTestId } = render(<CurrentTimeLine />);
    const line = getByTestId('now-line');
    expect(line).toBeInTheDocument();
    expect((line as HTMLElement).style.top).toBe('176px');
    expect(line.textContent).toContain('10:00');
  });

  it('oynadan oldin (06:00 local) → yashirin (null)', () => {
    // 01:00Z = 06:00 Tashkent → 360 min < dayStart 480
    freezeUtc('2026-06-10T01:00:00Z');
    const { queryByTestId } = render(<CurrentTimeLine />);
    expect(queryByTestId('now-line')).toBeNull();
  });

  it('oynadan keyin (21:00 local) → yashirin (null)', () => {
    // 16:00Z = 21:00 Tashkent → 1260 min > dayEnd 1200
    freezeUtc('2026-06-10T16:00:00Z');
    const { queryByTestId } = render(<CurrentTimeLine />);
    expect(queryByTestId('now-line')).toBeNull();
  });
});
