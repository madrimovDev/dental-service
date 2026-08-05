import { fireEvent, screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../test-utils';
import { ClinicDetailPage } from './ClinicDetailPage';

const fetchMock = vi.fn();

const clinic = {
  id: 'c1',
  name: 'Clinic One',
  contactEmail: 'one@test.com',
  contactPhone: null,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const license = {
  id: 'license-1',
  clinicId: 'c1',
  branchId: 'branch-1',
  licenseKey: 'AAAAA-BBBBB-CCCCC-DDDDD',
  fingerprint: null,
  plan: 'standard',
  modules: ['patients', 'appointments'],
  gracePeriodDays: 30,
  expiresAt: '2027-01-01T00:00:00.000Z',
  isActive: true,
  lastHeartbeatAt: null,
  activatedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const licenseWithFingerprint = {
  ...license,
  fingerprint: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
};

const jsonResponse = (body: unknown, ok = true) => ({ ok, json: async () => body });

const renderDetail = () =>
  renderApp(
    <Routes>
      <Route path="/clinics/:id" element={<ClinicDetailPage />} />
    </Routes>,
    { route: '/clinics/c1' },
  );

describe('ClinicDetailPage', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (
        init?.method === 'PATCH' &&
        url.endsWith('/v1/admin/licenses/AAAAA-BBBBB-CCCCC-DDDDD/modules')
      ) {
        return jsonResponse({ ok: true });
      }
      if (url.endsWith('/v1/admin/clinics/c1')) {
        return jsonResponse({ clinic, license });
      }
      throw new Error(`unhandled fetch: ${url} ${init?.method ?? 'GET'}`);
    });
  });

  it("klinika nomi + litsenziya ma'lumotlarini ko'rsatadi", async () => {
    renderDetail();
    expect(await screen.findByText('Clinic One')).toBeInTheDocument();
    expect(screen.getByText(/Litsenziya:/)).toHaveTextContent('AAAAA-BBBBB-CCCCC-DDDDD');
    expect(screen.getByText(/Tarif:/)).toHaveTextContent('standard');
  });

  it("faol modul switch'i yoqilgan holatda ko'rsatiladi", async () => {
    renderDetail();
    await screen.findByText('Clinic One');
    const patientsRow = screen.getByText('patients').closest('div');
    expect(patientsRow?.querySelector('input[type="checkbox"]')).toBeChecked();
    const cashierRow = screen.getByText('cashier').closest('div');
    expect(cashierRow?.querySelector('input[type="checkbox"]')).not.toBeChecked();
  });

  it("modul switch bosilsa PATCH /v1/admin/licenses/:key/modules yangilangan ro'yxat bilan chaqiriladi", async () => {
    renderDetail();
    await screen.findByText('Clinic One');

    const cashierRow = screen.getByText('cashier').closest('div');
    const cashierSwitch = cashierRow?.querySelector('input[type="checkbox"]');
    if (!cashierSwitch) throw new Error('cashier switch not found');
    fireEvent.click(cashierSwitch);

    await vi.waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/v1/admin/licenses/AAAAA-BBBBB-CCCCC-DDDDD/modules'),
        expect.objectContaining({ method: 'PATCH' }),
      ),
    );
    const patchCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH') as
      | [string, RequestInit]
      | undefined;
    if (!patchCall) throw new Error('PATCH call not found');
    const body = JSON.parse(String(patchCall[1].body));
    expect(body.modules).toEqual(expect.arrayContaining(['patients', 'appointments', 'cashier']));
  });

  it("modul PATCH so'rovi muvaffaqiyatsiz bo'lsa xato xabarini ko'rsatadi", async () => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (
        init?.method === 'PATCH' &&
        url.endsWith('/v1/admin/licenses/AAAAA-BBBBB-CCCCC-DDDDD/modules')
      ) {
        return jsonResponse({ error: { code: 'SERVER_ERROR' } }, false);
      }
      if (url.endsWith('/v1/admin/clinics/c1')) {
        return jsonResponse({ clinic, license });
      }
      throw new Error(`unhandled fetch: ${url} ${init?.method ?? 'GET'}`);
    });

    renderDetail();
    await screen.findByText('Clinic One');

    const cashierRow = screen.getByText('cashier').closest('div');
    const cashierSwitch = cashierRow?.querySelector('input[type="checkbox"]');
    if (!cashierSwitch) throw new Error('cashier switch not found');
    fireEvent.click(cashierSwitch);

    expect(await screen.findByText("Modulni yangilab bo'lmadi")).toBeInTheDocument();
  });

  it("holatni ko'rsatadi va 'Bekor qilish' bosilganda tasdiqlansa PATCH deactivate chaqiriladi", async () => {
    vi.stubGlobal(
      'confirm',
      vi.fn(() => true),
    );
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === 'PATCH' && url.endsWith('/v1/admin/clinics/c1/deactivate')) {
        return jsonResponse({ clinic, license: { ...license, isActive: false } });
      }
      if (url.endsWith('/v1/admin/clinics/c1')) {
        return jsonResponse({ clinic, license });
      }
      throw new Error(`unhandled fetch: ${url} ${init?.method ?? 'GET'}`);
    });

    renderDetail();
    await screen.findByText('Clinic One');
    expect(screen.getByText(/Holat:/)).toHaveTextContent('Faol');

    fireEvent.click(screen.getByRole('button', { name: 'Bekor qilish' }));

    await vi.waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/v1/admin/clinics/c1/deactivate'),
        expect.objectContaining({ method: 'PATCH' }),
      ),
    );
  });

  it("tasdiqlash bekor qilinsa (confirm=false) deactivate so'rovi yuborilmaydi", async () => {
    vi.stubGlobal(
      'confirm',
      vi.fn(() => false),
    );
    renderDetail();
    await screen.findByText('Clinic One');

    fireEvent.click(screen.getByRole('button', { name: 'Bekor qilish' }));

    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(false);
  });

  it("deactivate so'rovi muvaffaqiyatsiz bo'lsa xato xabarini ko'rsatadi", async () => {
    vi.stubGlobal(
      'confirm',
      vi.fn(() => true),
    );
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === 'PATCH' && url.endsWith('/v1/admin/clinics/c1/deactivate')) {
        return jsonResponse({ error: { code: 'SERVER_ERROR' } }, false);
      }
      if (url.endsWith('/v1/admin/clinics/c1')) {
        return jsonResponse({ clinic, license });
      }
      throw new Error(`unhandled fetch: ${url} ${init?.method ?? 'GET'}`);
    });

    renderDetail();
    await screen.findByText('Clinic One');
    fireEvent.click(screen.getByRole('button', { name: 'Bekor qilish' }));

    expect(await screen.findByText("Litsenziyani bekor qilib bo'lmadi")).toBeInTheDocument();
  });

  it("litsenziyada saqlangan fingerprint ko'rsatiladi", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/v1/admin/clinics/c1')) {
        return jsonResponse({ clinic, license: licenseWithFingerprint });
      }
      throw new Error(`unhandled fetch: ${url} ${init?.method ?? 'GET'}`);
    });

    renderDetail();
    await screen.findByText('Clinic One');
    expect(screen.getByText(/Fingerprint:/)).toHaveTextContent(licenseWithFingerprint.fingerprint);
  });

  it("fingerprint yo'q bo'lsa 'Reactivate' tugmasi disable bo'ladi va promptsiz hech qanday so'rov yubormaydi", async () => {
    vi.stubGlobal(
      'prompt',
      vi.fn(() => {
        throw new Error('prompt should not be called');
      }),
    );
    renderDetail();
    await screen.findByText('Clinic One');

    const reactivateButton = screen.getByRole('button', { name: 'Reactivate' });
    expect(reactivateButton).toBeDisabled();

    fireEvent.click(reactivateButton);
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
  });

  it("'Reactivate' bosilganda saqlangan fingerprint bilan POST /v1/reactivate promptsiz chaqiriladi", async () => {
    vi.stubGlobal(
      'prompt',
      vi.fn(() => {
        throw new Error('prompt should not be called');
      }),
    );
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === 'POST' && url.endsWith('/v1/reactivate')) {
        return jsonResponse({ ok: true });
      }
      if (url.endsWith('/v1/admin/clinics/c1')) {
        return jsonResponse({ clinic, license: licenseWithFingerprint });
      }
      throw new Error(`unhandled fetch: ${url} ${init?.method ?? 'GET'}`);
    });

    renderDetail();
    await screen.findByText('Clinic One');

    const reactivateButton = screen.getByRole('button', { name: 'Reactivate' });
    expect(reactivateButton).not.toBeDisabled();
    fireEvent.click(reactivateButton);

    await vi.waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/v1/reactivate'),
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    const reactivateCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST') as
      | [string, RequestInit]
      | undefined;
    if (!reactivateCall) throw new Error('POST /v1/reactivate call not found');
    const body = JSON.parse(String(reactivateCall[1].body));
    expect(body).toEqual({
      licenseKey: licenseWithFingerprint.licenseKey,
      fingerprint: licenseWithFingerprint.fingerprint,
    });
  });

  it("reactivate muvaffaqiyatli bo'lgandan keyin klinika ma'lumotlari qayta so'raladi (cache invalidatsiya)", async () => {
    let getCallCount = 0;
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === 'POST' && url.endsWith('/v1/reactivate')) {
        return jsonResponse({ ok: true });
      }
      if (url.endsWith('/v1/admin/clinics/c1')) {
        getCallCount += 1;
        return jsonResponse({ clinic, license: licenseWithFingerprint });
      }
      throw new Error(`unhandled fetch: ${url} ${init?.method ?? 'GET'}`);
    });

    renderDetail();
    await screen.findByText('Clinic One');
    expect(getCallCount).toBe(1);

    fireEvent.click(screen.getByRole('button', { name: 'Reactivate' }));

    await vi.waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/v1/reactivate'),
        expect.objectContaining({ method: 'POST' }),
      ),
    );

    await vi.waitFor(() => expect(getCallCount).toBe(2));
  });

  it("'Parol-tiklash tokeni yaratish' bosilganda litsenziya ID bilan POST /v1/admin/licenses/:id/reset-token chaqiriladi va natija bir marta ko'rsatiladi", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === 'POST' && url.endsWith(`/v1/admin/licenses/${license.id}/reset-token`)) {
        return jsonResponse({
          resetToken: 'ABCDE-12345-FEDCB',
          expiresAt: '2026-01-02T00:00:00.000Z',
        });
      }
      if (url.endsWith('/v1/admin/clinics/c1')) {
        return jsonResponse({ clinic, license });
      }
      throw new Error(`unhandled fetch: ${url} ${init?.method ?? 'GET'}`);
    });

    renderDetail();
    await screen.findByText('Clinic One');

    const genButton = screen.getByRole('button', { name: 'Parol-tiklash tokeni yaratish' });
    fireEvent.click(genButton);

    await vi.waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining(`/v1/admin/licenses/${license.id}/reset-token`),
        expect.objectContaining({ method: 'POST' }),
      ),
    );

    expect(await screen.findByDisplayValue('ABCDE-12345-FEDCB')).toBeInTheDocument();
    expect(
      screen.getByText("Bir marta ko'rsatiladi — mijozga bering. 24 soat amal qiladi."),
    ).toBeInTheDocument();
  });

  it("aktivatsiyagacha login telefoni va vaqtinchalik parolni ko'rsatadi", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/v1/admin/clinics/c1')) {
        return jsonResponse({
          clinic: {
            ...clinic,
            ownerFullName: 'Ali Valiyev',
            ownerPhone: '+998901234567',
            ownerTempPassword: 'AbCdEfGh2345',
          },
          license,
        });
      }
      throw new Error(`unhandled fetch: ${url} ${init?.method ?? 'GET'}`);
    });

    renderDetail();
    await screen.findByText('Clinic One');

    expect(await screen.findByText(/Aktivatsiya kutilmoqda/)).toBeInTheDocument();
    expect(screen.getByText('+998901234567')).toBeInTheDocument();
    expect(screen.getByText('AbCdEfGh2345')).toBeInTheDocument();
  });

  it("aktivatsiyadan keyin vaqtinchalik parol ko'rsatilmaydi", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/v1/admin/clinics/c1')) {
        return jsonResponse({
          clinic: {
            ...clinic,
            ownerFullName: 'Ali Valiyev',
            ownerPhone: '+998901234567',
            ownerTempPassword: null,
          },
          license,
        });
      }
      throw new Error(`unhandled fetch: ${url} ${init?.method ?? 'GET'}`);
    });

    renderDetail();
    await screen.findByText('Clinic One');

    expect(await screen.findByText(/vaqtinchalik parol o'chirilgan/)).toBeInTheDocument();
    expect(screen.queryByText(/Aktivatsiya kutilmoqda/)).not.toBeInTheDocument();
  });

  // Qayta o'rnatishga tayyorlash (audit C1) — vendor mijozga yangi login +
  // vaqtinchalik parol beradi, fingerprint bekor qilinadi.
  it("qayta o'rnatishga tayyorlash tugmasi tasdiqlangandan keyin kredensiallarni ko'rsatadi", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === 'POST' && url.endsWith('/v1/admin/clinics/c1/prepare-reinstall')) {
        return jsonResponse({
          credentials: { loginPhone: '+998901234567', tempPassword: 'AbCdEfGhJkLmNpQr' },
        });
      }
      if (url.endsWith('/v1/admin/clinics/c1')) {
        return jsonResponse({ clinic, license });
      }
      throw new Error(`unhandled fetch: ${url} ${init?.method ?? 'GET'}`);
    });

    renderDetail();
    await screen.findByText('Clinic One');

    // Tasdiqsiz hech qanday so'rov ketmaydi — amal destruktiv (eski parol
    // ishlamay qoladi, qurilma bog'lanishi uziladi).
    fireEvent.click(screen.getByRole('button', { name: "Qayta o'rnatishga tayyorlash" }));
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);

    fireEvent.click(await screen.findByRole('button', { name: 'Tasdiqlash' }));

    await vi.waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/v1/admin/clinics/c1/prepare-reinstall'),
        expect.objectContaining({ method: 'POST' }),
      ),
    );

    expect(await screen.findByText('AbCdEfGhJkLmNpQr')).toBeInTheDocument();
    expect(screen.getByText('+998901234567')).toBeInTheDocument();
  });

  it("qayta o'rnatishga tayyorlash so'rovi muvaffaqiyatsiz bo'lsa xato kodini ko'rsatadi", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === 'POST' && url.endsWith('/v1/admin/clinics/c1/prepare-reinstall')) {
        return jsonResponse({ error: { code: 'OWNER_PHONE_MISSING' } }, false);
      }
      if (url.endsWith('/v1/admin/clinics/c1')) {
        return jsonResponse({ clinic, license });
      }
      throw new Error(`unhandled fetch: ${url} ${init?.method ?? 'GET'}`);
    });

    renderDetail();
    await screen.findByText('Clinic One');

    fireEvent.click(screen.getByRole('button', { name: "Qayta o'rnatishga tayyorlash" }));
    fireEvent.click(await screen.findByRole('button', { name: 'Tasdiqlash' }));

    expect(await screen.findByText('OWNER_PHONE_MISSING')).toBeInTheDocument();
  });

  it("reset-token so'rovi muvaffaqiyatsiz bo'lsa xato xabarini ko'rsatadi", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === 'POST' && url.endsWith(`/v1/admin/licenses/${license.id}/reset-token`)) {
        return jsonResponse({ error: { code: 'SERVER_ERROR' } }, false);
      }
      if (url.endsWith('/v1/admin/clinics/c1')) {
        return jsonResponse({ clinic, license });
      }
      throw new Error(`unhandled fetch: ${url} ${init?.method ?? 'GET'}`);
    });

    renderDetail();
    await screen.findByText('Clinic One');

    fireEvent.click(screen.getByRole('button', { name: 'Parol-tiklash tokeni yaratish' }));

    expect(await screen.findByText("Parol-tiklash tokenini yaratib bo'lmadi")).toBeInTheDocument();
  });
});
