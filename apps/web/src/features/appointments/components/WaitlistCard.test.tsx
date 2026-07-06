import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { i18n } from '@/lib/i18n.ts';
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

  it("bo'sh-holat 'tez orada' Tag bilan aniq belgilanadi (haqiqiy bo'sh natijadan farqlanishi uchun, CLI-374)", () => {
    renderApp(<WaitlistCard appts={[]} />);
    expect(screen.getByTestId('waitlist-coming-soon')).toBeInTheDocument();
    expect(screen.getByTestId('waitlist-coming-soon')).toHaveTextContent(
      i18n.t('shell.coming_soon'),
    );
  });
});
