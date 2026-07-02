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
});
