import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../test-utils';
import { CreateClinicModal } from './CreateClinicModal';

const fetchMock = vi.fn();
const jsonResponse = (body: unknown, ok = true) => ({ ok, json: async () => body });

describe('CreateClinicModal', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    // CopyButton uses @mantine/hooks' useClipboard -> navigator.clipboard.writeText;
    // jsdom doesn't implement it, so stub it per-test (not in the global test-setup.ts,
    // this is the first component in the app to need it).
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
  });

  it("bo'sh nom bilan submit qilinsa validatsiya xatosini ko'rsatadi va so'rov yubormaydi", async () => {
    renderApp(<CreateClinicModal opened onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Yaratish' }));

    expect(await screen.findByText('Klinika nomi kiritilishi shart')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("to'g'ri to'ldirilgan formani submit qilganda POST /v1/admin/clinics chaqiradi va litsenziya kalitini ko'rsatadi", async () => {
    const clinic = {
      id: 'c1',
      name: 'New Clinic',
      contactEmail: null,
      contactPhone: null,
      ownerFullName: 'Ali Valiyev',
      ownerPhone: '+998901234567',
      createdAt: '2026-07-04T00:00:00.000Z',
    };
    const license = {
      id: 'lic1',
      clinicId: 'c1',
      branchId: 'b1',
      licenseKey: 'ABCDE-FGHIJ-KLMNO-PQRST',
      fingerprint: null,
      plan: 'standard',
      modules: ['patients'],
      gracePeriodDays: 30,
      expiresAt: '2027-07-04T00:00:00.000Z',
      isActive: true,
      lastHeartbeatAt: null,
      activatedAt: null,
      createdAt: '2026-07-04T00:00:00.000Z',
    };
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        clinic,
        license,
        credentials: { loginPhone: '+998901234567', tempPassword: 'AbCdEfGh2345' },
      }),
    );

    const onClose = vi.fn();
    renderApp(<CreateClinicModal opened onClose={onClose} />);

    fireEvent.change(screen.getByLabelText('Klinika nomi'), {
      target: { value: 'New Clinic' },
    });
    fireEvent.change(screen.getByLabelText('Amal qilish muddati'), {
      target: { value: '2027-07-04' },
    });
    fireEvent.change(screen.getByLabelText('Owner F.I.Sh.'), {
      target: { value: 'Ali Valiyev' },
    });
    fireEvent.change(screen.getByLabelText('Owner telefoni'), {
      target: { value: '901234567' },
    });
    // Tarif maydonini bu testda ataylab tegmaymiz — Mantine v7ning
    // non-searchable Select'i readOnly combobox input render qiladi;
    // fireEvent.change onChange'ni ishga tushirmaydi (faqat option-click
    // ishlaydi), shuning uchun forma `plan` uchun useForm initialValues'dagi
    // 'starter' default'ida qoladi va aynan shu qiymat tekshiriladi.

    fireEvent.click(screen.getByRole('button', { name: 'Yaratish' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls[0] as [unknown, RequestInit & { body: string }];
    expect(JSON.parse(init.body)).toMatchObject({ name: 'New Clinic', plan: 'starter' });

    expect(await screen.findByText('ABCDE-FGHIJ-KLMNO-PQRST')).toBeInTheDocument();

    // onClose hali chaqirilmagan — muvaffaqiyat holati avto-yopilmaydi.
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Nusxalash' }));
    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('ABCDE-FGHIJ-KLMNO-PQRST'),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Yopish' }));
    expect(onClose).toHaveBeenCalled();
  });

  it("owner maydonlari majburiy — bo'sh qoldirilsa validatsiya xatosi chiqadi va so'rov yuborilmaydi", async () => {
    renderApp(<CreateClinicModal opened onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Klinika nomi'), { target: { value: 'New Clinic' } });
    fireEvent.change(screen.getByLabelText('Amal qilish muddati'), {
      target: { value: '2027-07-04' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Yaratish' }));

    expect(await screen.findByText('Owner F.I.Sh. kiritilishi shart')).toBeInTheDocument();
    expect(screen.getByText('Owner telefoni kiritilishi shart')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("yaratilgandan keyin login telefoni va vaqtinchalik parolni ko'rsatadi va nusxalaydi", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        clinic: {
          id: 'c1',
          name: 'New Clinic',
          contactEmail: null,
          contactPhone: null,
          ownerFullName: 'Ali Valiyev',
          ownerPhone: '+998901234567',
          createdAt: '2026-08-03T00:00:00.000Z',
        },
        license: {
          id: 'lic1',
          clinicId: 'c1',
          branchId: 'b1',
          licenseKey: 'ABCDE-FGHIJ-KLMNO-PQRST',
          fingerprint: null,
          plan: 'starter',
          modules: ['patients'],
          gracePeriodDays: 30,
          expiresAt: '2027-07-04T00:00:00.000Z',
          isActive: true,
          lastHeartbeatAt: null,
          activatedAt: null,
          createdAt: '2026-08-03T00:00:00.000Z',
        },
        credentials: { loginPhone: '+998901234567', tempPassword: 'AbCdEfGh2345' },
      }),
    );

    renderApp(<CreateClinicModal opened onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Klinika nomi'), { target: { value: 'New Clinic' } });
    fireEvent.change(screen.getByLabelText('Amal qilish muddati'), {
      target: { value: '2027-07-04' },
    });
    fireEvent.change(screen.getByLabelText('Owner F.I.Sh.'), {
      target: { value: 'Ali Valiyev' },
    });
    fireEvent.change(screen.getByLabelText('Owner telefoni'), {
      target: { value: '901234567' },
    });
    fireEvent.change(screen.getByLabelText('Filial manzili'), {
      target: { value: 'Toshkent, Chilonzor 12' },
    });
    // "Til" Select'iga ataylab tegilmaydi — Mantine v7 non-searchable Select
    // readOnly combobox render qiladi (yuqoridagi "Tarif" izohiga qarang),
    // shuning uchun initialValues'dagi 'uz' default'i tekshiriladi.

    fireEvent.click(screen.getByRole('button', { name: 'Yaratish' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls[0] as [unknown, RequestInit & { body: string }];
    expect(JSON.parse(init.body)).toMatchObject({
      ownerFullName: 'Ali Valiyev',
      ownerPhone: '901234567',
      defaultLanguage: 'uz',
      branchName: 'Bosh filial',
      branchAddress: 'Toshkent, Chilonzor 12',
    });

    // Login sifatida serverdan qaytgan normallashtirilgan telefon ko'rsatiladi
    // (formadagi xom qiymat emas).
    expect(await screen.findByText('+998901234567')).toBeInTheDocument();
    expect(screen.getByText('AbCdEfGh2345')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: "Kirish ma'lumotlarini nusxalash" }));
    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        'Login: +998901234567\nParol: AbCdEfGh2345',
      ),
    );
  });

  it("server xato qaytarsa forma view ichida xato xabarini ko'rsatadi (forma qayta ishlatiladi)", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: false }, false));
    renderApp(<CreateClinicModal opened onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Klinika nomi'), {
      target: { value: 'New Clinic' },
    });
    fireEvent.change(screen.getByLabelText('Amal qilish muddati'), {
      target: { value: '2027-07-04' },
    });
    fireEvent.change(screen.getByLabelText('Owner F.I.Sh.'), {
      target: { value: 'Ali Valiyev' },
    });
    fireEvent.change(screen.getByLabelText('Owner telefoni'), {
      target: { value: '901234567' },
    });
    // Tarifga tegilmaydi — 'starter' default'i required-validatsiyani
    // qondirish uchun yetarli (bu testda plan qiymati tekshirilmaydi).
    fireEvent.click(screen.getByRole('button', { name: 'Yaratish' }));

    expect(await screen.findByText("Klinika yaratib bo'lmadi")).toBeInTheDocument();
    expect(screen.getByLabelText('Klinika nomi')).toHaveValue('New Clinic');
  });
});
