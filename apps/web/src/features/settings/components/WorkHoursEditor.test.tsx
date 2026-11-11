import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../test-utils';
import { DEFAULT_WORK_HOURS, WorkHoursEditor } from './WorkHoursEditor';

describe('WorkHoursEditor', () => {
  it('yopiq kunda vaqt maydonlari yo‘q, ochiq kunda bor', () => {
    renderApp(<WorkHoursEditor value={DEFAULT_WORK_HOURS} onChange={vi.fn()} />);
    expect(screen.getByLabelText('Dushanba — Ochilish')).toHaveValue('09:00');
    expect(screen.queryByLabelText('Yakshanba — Ochilish')).not.toBeInTheDocument();
  });

  it('kunni yoqish default vaqt bilan, o‘chirish null bilan onChange beradi', () => {
    const onChange = vi.fn();
    renderApp(<WorkHoursEditor value={DEFAULT_WORK_HOURS} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('Yakshanba — Ochiq'));
    expect(onChange).toHaveBeenLastCalledWith({
      ...DEFAULT_WORK_HOURS,
      sun: { open: '09:00', close: '18:00' },
    });
    fireEvent.click(screen.getByLabelText('Dushanba — Ochiq'));
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_WORK_HOURS, mon: null });
  });

  it('vaqtni o‘zgartirish', () => {
    const onChange = vi.fn();
    renderApp(<WorkHoursEditor value={DEFAULT_WORK_HOURS} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Juma — Yopilish'), { target: { value: '17:00' } });
    expect(onChange).toHaveBeenLastCalledWith({
      ...DEFAULT_WORK_HOURS,
      fri: { open: '09:00', close: '17:00' },
    });
  });
});
