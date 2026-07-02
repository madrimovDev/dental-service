import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../test-utils';
import { ClinicsPage } from './ClinicsPage';

const fetchMock = vi.fn();

const clinicOne = {
  id: 'c1',
  name: 'Clinic One',
  contactEmail: 'one@test.com',
  contactPhone: null,
  createdAt: '2026-01-01T00:00:00.000Z',
};
const clinicTwo = {
  id: 'c2',
  name: 'Clinic Two',
  contactEmail: 'two@test.com',
  contactPhone: null,
  createdAt: '2026-01-02T00:00:00.000Z',
};

const licenseFor = (clinicId: string, overrides: Record<string, unknown> = {}) => ({
  id: `license-${clinicId}`,
  clinicId,
  branchId: `branch-${clinicId}`,
  licenseKey: `KEY-${clinicId}`,
  fingerprint: null,
  plan: 'standard',
  modules: ['patients'],
  gracePeriodDays: 30,
  expiresAt: '2027-01-01T00:00:00.000Z',
  isActive: true,
  lastHeartbeatAt: null,
  activatedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const jsonResponse = (body: unknown, ok = true) => ({ ok, json: async () => body });

describe('ClinicsPage', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/v1/admin/clinics')) {
        return jsonResponse([clinicOne, clinicTwo]);
      }
      if (url.endsWith('/v1/admin/clinics/c1')) {
        return jsonResponse({ clinic: clinicOne, license: licenseFor('c1', { isActive: true }) });
      }
      if (url.endsWith('/v1/admin/clinics/c2')) {
        return jsonResponse({ clinic: clinicTwo, license: licenseFor('c2', { isActive: false }) });
      }
      throw new Error(`unhandled fetch: ${url}`);
    });
  });

  it("klinikalar ro'yxatini nomi bilan ko'rsatadi", async () => {
    renderApp(<ClinicsPage />);
    expect(await screen.findByText('Clinic One')).toBeInTheDocument();
    expect(await screen.findByText('Clinic Two')).toBeInTheDocument();
  });

  it("har bir klinika uchun litsenziya faol/nofaol badge ko'rsatadi (detail-endpoint bilan boyitilgan)", async () => {
    renderApp(<ClinicsPage />);

    // Badge ma'lumoti ikkinchi (detail) so'rovdan keladi — async kutish shart,
    // aks holda pending holatda hamma "Nofaol" ko'rinib noto'g'ri o'tadi.
    expect(await screen.findByText('KEY-c1')).toBeInTheDocument();
    expect(await screen.findByText('KEY-c2')).toBeInTheDocument();

    const badges = await screen.findAllByText(/Faol|Nofaol/);
    const labels = badges.map((b) => b.textContent);
    expect(labels).toContain('Faol');
    expect(labels).toContain('Nofaol');
  });
});
