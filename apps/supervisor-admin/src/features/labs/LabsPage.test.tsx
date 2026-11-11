import { fireEvent, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../test-utils';
import { LabsPage } from './LabsPage';

const fetchMock = vi.fn();
const jsonResponse = (body: unknown, ok = true, status = ok ? 200 : 400) => ({
  ok,
  status,
  json: async () => body,
});

const labOne = {
  id: 'l1',
  name: 'Dental Lab Pro',
  city: 'Toshkent',
  description: null,
  catalogVisible: true,
  expiresAt: '2027-01-01T23:59:59.000Z',
  subscription: 'active',
  createdAt: '2026-11-01T00:00:00.000Z',
};
const labTwo = {
  ...labOne,
  id: 'l2',
  name: 'Eski Lab',
  subscription: 'expired',
  catalogVisible: false,
};

describe('LabsPage', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('lablar ro‘yxati: nom, shahar, obuna holati, katalog', async () => {
    fetchMock.mockImplementation(async () => jsonResponse({ labs: [labOne, labTwo] }));
    renderApp(<LabsPage />);
    expect(await screen.findByText('Dental Lab Pro')).toBeInTheDocument();
    expect(screen.getByText('Eski Lab')).toBeInTheDocument();
    expect(screen.getByText('Faol')).toBeInTheDocument();
    expect(screen.getByText('Muddati tugagan')).toBeInTheDocument();
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/v1/admin/labs');
  });

  it('Hub sozlanmagan (503) — tushunarli xato', async () => {
    fetchMock.mockImplementation(async () =>
      jsonResponse({ error: { code: 'LAB_HUB_NOT_CONFIGURED' } }, false, 503),
    );
    renderApp(<LabsPage />);
    expect(await screen.findByText(/Lab Hub ulanmagan/)).toBeInTheDocument();
  });

  it('yaratish: lead vaqtinchalik paroli bir marta ko‘rsatiladi', async () => {
    fetchMock.mockImplementation(async (_input: unknown, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return jsonResponse({
          lab: { ...labOne, id: 'l3', name: 'Yangi Lab' },
          lead: { fullName: 'Rahbar', phone: '+998901234567', tempPassword: 'TmpPass23456789x' },
        });
      }
      return jsonResponse({ labs: [labOne] });
    });
    renderApp(<LabsPage />);
    await screen.findByText('Dental Lab Pro');
    fireEvent.click(screen.getByRole('button', { name: '+ Yangi laboratoriya' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Laboratoriya nomi'), {
      target: { value: 'Yangi Lab' },
    });
    fireEvent.change(within(dialog).getByLabelText('Obuna muddati'), {
      target: { value: '2027-11-12' },
    });
    fireEvent.change(within(dialog).getByLabelText('Rahbar F.I.Sh.'), {
      target: { value: 'Rahbar' },
    });
    fireEvent.change(within(dialog).getByLabelText('Rahbar telefoni'), {
      target: { value: '901234567' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Yaratish' }));
    expect(await screen.findByText('TmpPass23456789x')).toBeInTheDocument();
    expect(screen.getByText('+998901234567')).toBeInTheDocument();
    const post = fetchMock.mock.calls.find(
      ([, i]) => (i as RequestInit | undefined)?.method === 'POST',
    );
    expect(JSON.parse(String((post?.[1] as RequestInit).body))).toMatchObject({
      name: 'Yangi Lab',
      expiresAt: '2027-11-12',
      leadPhone: '901234567',
    });
  });

  it('uzaytirish: PATCH yangi muddat bilan', async () => {
    fetchMock.mockImplementation(async (_input: unknown, init?: RequestInit) =>
      init?.method === 'PATCH' ? jsonResponse({ lab: labOne }) : jsonResponse({ labs: [labOne] }),
    );
    renderApp(<LabsPage />);
    await screen.findByText('Dental Lab Pro');
    fireEvent.click(screen.getByRole('button', { name: 'Uzaytirish' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Yangi muddat'), {
      target: { value: '2028-01-31' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Saqlash' }));
    await vi.waitFor(() => {
      const patch = fetchMock.mock.calls.find(
        ([, i]) => (i as RequestInit | undefined)?.method === 'PATCH',
      );
      expect(String(patch?.[0])).toContain('/v1/admin/labs/l1');
      expect(JSON.parse(String((patch?.[1] as RequestInit).body))).toEqual({
        expiresAt: '2028-01-31',
      });
    });
  });
});
