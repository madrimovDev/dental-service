import { fireEvent, screen, within } from '@testing-library/react';
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

  it("ro'yxat so'rovi muvaffaqiyatsiz bo'lsa xato xabarini ko'rsatadi (bo'sh jadval emas)", async () => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/v1/admin/clinics')) {
        return jsonResponse({ error: { code: 'UNAUTHORIZED' } }, false);
      }
      throw new Error(`unhandled fetch: ${url}`);
    });

    renderApp(<ClinicsPage />);

    expect(await screen.findByText(/Klinikalar ro'yxatini yuklab bo'lmadi/)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it("'+ Yangi klinika' bosilganda modal ochiladi va yaratilgandan so'ng ro'yxat yangilanadi", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === 'POST' && url.endsWith('/v1/admin/clinics')) {
        const newClinic = {
          id: 'c3',
          name: 'New Clinic',
          contactEmail: null,
          contactPhone: null,
          createdAt: '2026-07-04T00:00:00.000Z',
        };
        return jsonResponse({
          clinic: newClinic,
          license: licenseFor('c3', { plan: 'standard' }),
        });
      }
      if (url.endsWith('/v1/admin/clinics')) {
        return jsonResponse([clinicOne, clinicTwo]);
      }
      if (url.endsWith('/v1/admin/clinics/c1')) {
        return jsonResponse({ clinic: clinicOne, license: licenseFor('c1', { isActive: true }) });
      }
      if (url.endsWith('/v1/admin/clinics/c2')) {
        return jsonResponse({ clinic: clinicTwo, license: licenseFor('c2', { isActive: false }) });
      }
      throw new Error(`unhandled fetch: ${url} ${init?.method ?? 'GET'}`);
    });

    renderApp(<ClinicsPage />);
    await screen.findByText('Clinic One');

    const button = screen.getByRole('button', { name: '+ Yangi klinika' });
    expect(button).not.toBeDisabled();
    fireEvent.click(button);

    // Modal ochilishi Mantine transition tufayli asinxron — dialog'ni kutamiz.
    // Maydon so'rovlarini dialog ichiga cheklaymiz, chunki jadval "Tarif"
    // ustun sarlavhasi bilan modal "Tarif" label'i getByLabelText'da
    // to'qnashadi (ikkalasi ham matn sifatida topiladi).
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Klinika nomi'), {
      target: { value: 'New Clinic' },
    });
    fireEvent.change(within(dialog).getByLabelText('Amal qilish muddati'), {
      target: { value: '2027-07-04' },
    });
    fireEvent.change(within(dialog).getByLabelText('Tarif'), { target: { value: 'standard' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Yaratish' }));

    expect(await screen.findByText(/KEY-c3/)).toBeInTheDocument();
  });
});
