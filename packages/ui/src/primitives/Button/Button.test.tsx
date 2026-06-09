import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderUI } from '../../test-utils';
import { Button } from './Button';

describe('Button', () => {
  it('matnni render qiladi va onClick chaqiriladi', () => {
    const onClick = vi.fn();
    renderUI(<Button onClick={onClick}>Saqlash</Button>);
    const btn = screen.getByRole('button', { name: 'Saqlash' });
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('variant data-atributini qoyadi', () => {
    renderUI(<Button variant="primary">Yangi</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('data-variant', 'primary');
  });

  it('disabled holatda click ishlamaydi', () => {
    const onClick = vi.fn();
    renderUI(
      <Button disabled onClick={onClick}>
        X
      </Button>,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });
});
