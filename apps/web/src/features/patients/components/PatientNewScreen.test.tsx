import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../test-utils';
import { PatientNewScreen } from './PatientNewScreen';

const createMock = vi.fn();
vi.mock('../patients.api', () => ({
  useCreatePatient: () => ({ mutate: createMock, isPending: false }),
}));

const navigateMock = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigateMock };
});

describe('PatientNewScreen', () => {
  beforeEach(() => {
    createMock.mockClear();
    navigateMock.mockClear();
  });

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

  it('bosh ism bilan submit qilsa validatsiya xabari korinadi (CLI-179 bug guard)', async () => {
    renderApp(<PatientNewScreen />);
    fireEvent.click(screen.getByText('Saqlash'));
    // fullName '' → min(2) buziladi → form.errors.fullName → Input error render
    await vi.waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(createMock).not.toHaveBeenCalled();
  });

  it('back-link bosilsa /patients ga navigatsiya (DS2 additive)', () => {
    renderApp(<PatientNewScreen />);
    fireEvent.click(screen.getByTestId('back-link'));
    expect(navigateMock).toHaveBeenCalledWith('/patients');
  });

  it('ism yozilganda checklist nuqtasi to‘ladi (DS2 presentational)', () => {
    renderApp(<PatientNewScreen />);
    const dot = screen.getByTestId('checklist-dot-name');
    // boshida bo'sh → data-filled yo'q
    expect(dot).not.toHaveAttribute('data-filled');
    fireEvent.change(screen.getByLabelText("To'liq ism"), {
      target: { value: 'Ali' },
    });
    expect(screen.getByTestId('checklist-dot-name')).toHaveAttribute('data-filled', 'true');
  });

  it("sug'urta 'faol' belgilanib provider bo'sh qolsa validatsiya xatosi ko'rinadi va submit bloklanadi (CLI-469)", async () => {
    renderApp(<PatientNewScreen />);
    fireEvent.change(screen.getByLabelText("To'liq ism"), {
      target: { value: 'Ali Valiyev' },
    });
    // provider/policyNumber bo'sh qoldiriladi, faqat isActive belgilanadi
    fireEvent.click(screen.getByLabelText("Sug'urta faol"));
    fireEvent.click(screen.getByText('Saqlash'));
    await vi.waitFor(() =>
      expect(
        screen.getByText(
          "Sug'urta ma'lumotlarini to'ldirsangiz, kompaniya nomi ham kiritilishi shart",
        ),
      ).toBeInTheDocument(),
    );
    expect(createMock).not.toHaveBeenCalled();
  });
});
