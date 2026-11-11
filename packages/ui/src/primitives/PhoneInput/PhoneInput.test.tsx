import { fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderUI } from '../../test-utils';
import { extractNational, formatNational, PhoneInput } from './PhoneInput';

describe('PhoneInput', () => {
  const setup = (initial = '') => {
    const spy = vi.fn();
    function Host() {
      const [v, setV] = useState(initial);
      return (
        <PhoneInput
          label="Telefon"
          value={v}
          onChange={(x) => {
            spy(x);
            setV(x);
          }}
        />
      );
    }
    renderUI(<Host />);
    return { spy, input: screen.getByLabelText('Telefon') as HTMLInputElement };
  };

  it.each([
    ['90 123-45-67'],
    ['901234567'],
    ['+998 (90) 123-45-67'],
    ['998901234567'],
  ])("'%s' → +998901234567", (raw) => {
    const { spy, input } = setup();
    fireEvent.change(input, { target: { value: raw } });
    expect(spy).toHaveBeenLastCalledWith('+998901234567');
    expect(input.value).toBe('90 123 45 67');
  });

  it("qisman kiritishda to'liq bo'lmagan kanonik qiymat, bo'shda ''", () => {
    const { spy, input } = setup();
    fireEvent.change(input, { target: { value: '90 12' } });
    expect(spy).toHaveBeenLastCalledWith('+998' + '9012');
    fireEvent.change(input, { target: { value: '' } });
    expect(spy).toHaveBeenLastCalledWith('');
  });

  it('tashqi value (forma qiymati) milliy ko‘rinishda chiqadi va reset ishlaydi', () => {
    const { input } = setup('+998901234567');
    expect(input.value).toBe('90 123 45 67');
  });

  it('error berilsa aria-invalid va xabar', () => {
    renderUI(<PhoneInput label="Tel" error="Noto'g'ri raqam" />);
    expect(screen.getByLabelText('Tel')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent("Noto'g'ri raqam");
  });

  it('yordamchilar', () => {
    expect(extractNational('+998 90')).toBe('90');
    expect(extractNational('998 90 123 45 67')).toBe('901234567');
    expect(formatNational('9012')).toBe('90 12');
  });
});
