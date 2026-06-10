import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../test-utils';
import { PatientNewScreen } from './PatientNewScreen';

const createMock = vi.fn();
vi.mock('../patients.api', () => ({
  useCreatePatient: () => ({ mutate: createMock, isPending: false }),
}));

describe('PatientNewScreen', () => {
  it("form maydonlari + teg/manba/sug'urta ko'rsatadi", () => {
    renderApp(<PatientNewScreen />);
    // i18n default uz → tarjima qiymatlari (uz.json'dan)
    expect(screen.getByText("To'liq ism")).toBeInTheDocument();
    expect(screen.getByText('Manba')).toBeInTheDocument();
    expect(screen.getByText("Sug'urta")).toBeInTheDocument();
  });

  it('ism kiritib saqlasa create id bilan chaqiriladi (behavioral — form wiring)', async () => {
    renderApp(<PatientNewScreen />);
    fireEvent.change(screen.getByLabelText("To'liq ism"), {
      target: { value: 'Yangi Bemor' },
    });
    fireEvent.click(screen.getByText('Saqlash'));
    // form valid → createMut.mutate fullName bilan chaqiriladi
    await vi.waitFor(() => expect(createMock).toHaveBeenCalled());
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({ fullName: 'Yangi Bemor' }),
      expect.anything(),
    );
  });
});
