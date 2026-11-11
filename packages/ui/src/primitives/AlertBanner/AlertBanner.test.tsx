import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderUI } from '../../test-utils';
import { AlertBanner } from './AlertBanner';

describe('AlertBanner', () => {
  it('2-daraja (attention): role=alert, sarlavha va matn, data-tier=2', () => {
    renderUI(
      <AlertBanner tier={2} title="Allergiya">
        Penitsillin
      </AlertBanner>,
    );
    const el = screen.getByRole('alert');
    expect(el.getAttribute('data-tier')).toBe('2');
    expect(el).toHaveTextContent('Allergiya');
    expect(el).toHaveTextContent('Penitsillin');
  });

  it("3-daraja (ma'lumot): role=status, to'xtatmaydi", () => {
    renderUI(<AlertBanner tier={3}>7 bemorni qayta chaqirish</AlertBanner>);
    const el = screen.getByRole('status');
    expect(el.getAttribute('data-tier')).toBe('3');
  });

  it('action berilsa tugma chiqadi va chaqiriladi', () => {
    const onClick = vi.fn();
    renderUI(
      <AlertBanner tier={3} action={{ label: "Ko'rish", onClick }}>
        Matn
      </AlertBanner>,
    );
    fireEvent.click(screen.getByRole('button', { name: "Ko'rish" }));
    expect(onClick).toHaveBeenCalledOnce();
  });
});
