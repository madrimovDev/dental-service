import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../../../test-utils';
import { WaitlistCard } from './WaitlistCard';

describe('WaitlistCard', () => {
  it("karta chrome + bo'sh-holatni ko'rsatadi", () => {
    renderApp(<WaitlistCard appts={[]} />);
    expect(screen.getByTestId('waitlist-empty')).toBeInTheDocument();
  });

  it('appts berilmasa ham xavfsiz render bo‘ladi', () => {
    renderApp(<WaitlistCard />);
    expect(screen.getByTestId('waitlist-empty')).toBeInTheDocument();
  });

  it("foydasiz 'Slotga joylashtirish' tugmasi JO'NATILMAYDI (data-gap, ds12)", () => {
    renderApp(<WaitlistCard appts={[]} />);
    // Live amal yo'q — hech qanday tugma render qilinmaydi.
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
