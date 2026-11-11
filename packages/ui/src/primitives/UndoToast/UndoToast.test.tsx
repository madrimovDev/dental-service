import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderUI } from '../../test-utils';
import { UndoToast } from './UndoToast';

describe('UndoToast', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const setup = () => {
    const onUndo = vi.fn();
    const onCommit = vi.fn();
    renderUI(
      <UndoToast undoLabel="Qaytarish" onUndo={onUndo} onCommit={onCommit}>
        Kelmadi deb belgilandi
      </UndoToast>,
    );
    return { onUndo, onCommit };
  };

  it('10 s ichida qaytarish chaqiriladi va commit bo‘lmaydi', () => {
    const { onUndo, onCommit } = setup();
    expect(screen.getByRole('button')).toHaveTextContent('Qaytarish · 10 s');
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(screen.getByRole('button')).toHaveTextContent('Qaytarish · 6 s');
    fireEvent.click(screen.getByRole('button'));
    expect(onUndo).toHaveBeenCalledOnce();
    act(() => {
      vi.advanceTimersByTime(20_000);
    });
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('10 s o‘tgach commit bir marta chaqiriladi', () => {
    const { onUndo, onCommit } = setup();
    act(() => {
      vi.advanceTimersByTime(9_000);
    });
    expect(onCommit).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(onCommit).toHaveBeenCalledOnce();
    act(() => {
      vi.advanceTimersByTime(20_000);
    });
    expect(onCommit).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button'));
    expect(onUndo).not.toHaveBeenCalled();
  });
});
