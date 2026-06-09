import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderUI } from '../../test-utils';
import { Input } from './Input';

describe('Input', () => {
  it('label va placeholder render qiladi', () => {
    renderUI(<Input label="Ism" placeholder="Bemor ismi" />);
    expect(screen.getByText('Ism')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Bemor ismi')).toBeInTheDocument();
  });

  it('onChange xom string qiymat beradi', () => {
    const onChange = vi.fn();
    renderUI(<Input onChange={onChange} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Ali' } });
    expect(onChange).toHaveBeenCalledWith('Ali', expect.anything());
  });

  it('invalid data-atributini qoyadi', () => {
    renderUI(<Input invalid />);
    expect(screen.getByRole('textbox').closest('[data-invalid]')).not.toBeNull();
  });
});
