import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../test-utils';
import { PatientNewScreen } from './PatientNewScreen';

const createMock = vi.fn();
// biome-ignore lint/suspicious/noExplicitAny: test-only mutable mock result
let phoneCheckData: any[] | undefined;
vi.mock('../patients.api', () => ({
  useCreatePatient: () => ({ mutate: createMock, isPending: false }),
  usePhoneCheck: () => ({ data: phoneCheckData }),
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
    phoneCheckData = undefined;
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

  describe('telefon dublikati (UI-R6)', () => {
    const fillNameAndPhone = () => {
      fireEvent.change(screen.getByLabelText("To'liq ism"), { target: { value: 'Yangi Bemor' } });
      fireEvent.change(screen.getByLabelText(/Telefon/, { selector: 'input' }), {
        target: { value: '901234567' },
      });
    };

    it('dublikat topilsa ogohlantirish + «Uni ochish» / «Baribir yangi» ko‘rinadi', () => {
      phoneCheckData = [{ id: 'p9', fullName: 'Jasur Tursunov' }];
      renderApp(<PatientNewScreen />);
      fillNameAndPhone();
      const box = screen.getByTestId('phone-dup');
      expect(box).toHaveTextContent('Jasur Tursunov');
      fireEvent.click(screen.getByText('Uni ochish'));
      expect(navigateMock).toHaveBeenCalledWith('/patients/p9');
    });

    it('tanlovsiz saqlash to‘xtatiladi; «Baribir yangi» dan keyin saqlanadi', async () => {
      phoneCheckData = [{ id: 'p9', fullName: 'Jasur Tursunov' }];
      renderApp(<PatientNewScreen />);
      fillNameAndPhone();

      fireEvent.click(screen.getByText('Saqlash'));
      await vi.waitFor(() => expect(screen.getByText(/Avval tanlang/)).toBeInTheDocument());
      expect(createMock).not.toHaveBeenCalled();

      fireEvent.click(screen.getByText("Baribir yangi (oila a'zosi)"));
      expect(screen.queryByTestId('phone-dup')).not.toBeInTheDocument();
      fireEvent.click(screen.getByText('Saqlash'));
      await vi.waitFor(() => expect(createMock).toHaveBeenCalled());
      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({ fullName: 'Yangi Bemor', phone: '+998901234567' }),
        expect.anything(),
      );
    });

    it('dublikat yo‘q bo‘lsa ogohlantirish chiqmaydi va saqlash to‘siqsiz', async () => {
      phoneCheckData = [];
      renderApp(<PatientNewScreen />);
      fillNameAndPhone();
      expect(screen.queryByTestId('phone-dup')).not.toBeInTheDocument();
      fireEvent.click(screen.getByText('Saqlash'));
      await vi.waitFor(() => expect(createMock).toHaveBeenCalled());
    });
  });
});
