import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderUI } from '../../test-utils';
import { CriticalActionDialog } from './CriticalActionDialog';

const reasons = [
  { value: 'tolerated', label: 'Avval muammosiz qabul qilgan' },
  { value: 'wrong', label: "Allergiya noto'g'ri kiritilgan" },
];

const setup = () => {
  const onSafe = vi.fn();
  const onConfirm = vi.fn();
  renderUI(
    <CriticalActionDialog
      opened
      title="Allergiya"
      reasons={reasons}
      reasonsLabel="Sabab"
      safeLabel="Boshqa dori tanlash"
      dangerLabel="Davom etish"
      onSafe={onSafe}
      onConfirm={onConfirm}
    >
      Amoksitsillin — penitsillin guruhi.
    </CriticalActionDialog>,
  );
  return { onSafe, onConfirm };
};

describe('CriticalActionDialog', () => {
  it('sabab tanlanmaguncha xavfli tugma disabled, tanlangach faol va sabab bilan chaqiriladi', () => {
    const { onConfirm } = setup();
    const danger = screen.getByRole('button', { name: 'Davom etish' });
    expect(danger).toBeDisabled();
    fireEvent.click(danger);
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('radio', { name: "Allergiya noto'g'ri kiritilgan" }));
    expect(danger).not.toBeDisabled();
    fireEvent.click(danger);
    expect(onConfirm).toHaveBeenCalledWith('wrong');
  });

  it('xavfsiz variant doim faol va asosiy tugma', () => {
    const { onSafe } = setup();
    const safe = screen.getByRole('button', { name: 'Boshqa dori tanlash' });
    expect(safe).not.toBeDisabled();
    fireEvent.click(safe);
    expect(onSafe).toHaveBeenCalledOnce();
  });

  it("sabablar bo'lmasa xavfli tugma darhol faol", () => {
    renderUI(
      <CriticalActionDialog
        opened
        title="T"
        safeLabel="Xavfsiz"
        dangerLabel="Xavfli"
        onSafe={() => {}}
        onConfirm={() => {}}
      >
        m
      </CriticalActionDialog>,
    );
    expect(screen.getByRole('button', { name: 'Xavfli' })).not.toBeDisabled();
  });
});
