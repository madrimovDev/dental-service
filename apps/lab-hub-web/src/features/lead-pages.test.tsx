import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RequireLead } from '@/features/auth/guards';
import { mockHub, renderApp, signIn } from '../test-utils';
import { priceItems, users } from './cases/fixtures';
import { ClinicsPage } from './clinics/ClinicsPage';
import { PricesPage } from './prices/PricesPage';
import { StaffPage } from './staff/StaffPage';

const link = (over = {}) => ({
  id: 'lk1',
  clinicId: 'cl-1',
  clinicName: 'Smile Dent',
  status: 'pending',
  requestedAt: '2026-11-10T08:00:00.000Z',
  decidedAt: null,
  ...over,
});

describe('lead pages', () => {
  beforeEach(() => localStorage.clear());

  it('klinikalar: so‘rovni tasdiqlash va akt-sverkada «to‘landi» belgisi', async () => {
    signIn('lead');
    const hub = mockHub({
      'GET /v1/lab/links': () => ({ body: { links: [link()] } }),
      'POST /v1/lab/links/lk1/decision': () => ({
        body: { link: { id: 'lk1', status: 'active' } },
      }),
      'GET /v1/lab/settlements': () => ({
        body: {
          period: '2026-11',
          rows: [
            {
              clinicId: 'cl-1',
              clinicName: 'Smile Dent',
              totalApproved: '2700000.00',
              caseCount: 2,
              paidAt: null,
              paidTotal: null,
            },
          ],
        },
      }),
      'POST /v1/lab/settlements/mark-paid': () => ({ body: { settlement: {} } }),
    });
    vi.stubGlobal('fetch', hub.fn);
    renderApp(<ClinicsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Tasdiqlash' }));
    await waitFor(() =>
      expect(hub.calls.find((c) => c.url.endsWith('/decision'))?.body).toEqual({
        decision: 'approve',
      }),
    );
    const table = (await screen.findByText('Tasdiqlangan jami')).closest('table') as HTMLElement;
    expect(within(table).getByText(/2[\s ]700[\s ]000/)).toBeInTheDocument();
    fireEvent.click(within(table).getByRole('button', { name: "To'landi deb belgilash" }));
    await waitFor(() => {
      const b = hub.calls.find((c) => c.url.endsWith('/mark-paid'))?.body as Record<
        string,
        unknown
      >;
      expect(b).toMatchObject({ clinicId: 'cl-1', paid: true });
      expect(b.period).toMatch(/^\d{4}-\d{2}$/);
    });
  });

  it('texnik klinikalar sahifasida qaror tugmalari va akt-sverkani ko‘rmaydi', async () => {
    signIn('technician', 't1');
    const hub = mockHub({ 'GET /v1/lab/links': () => ({ body: { links: [link()] } }) });
    vi.stubGlobal('fetch', hub.fn);
    renderApp(<ClinicsPage />);
    await screen.findByText('Smile Dent');
    expect(screen.queryByRole('button', { name: 'Tasdiqlash' })).toBeNull();
    expect(hub.calls.some((c) => c.url.includes('/settlements'))).toBe(false);
  });

  it('xodimlar: texnik uchun «faqat rahbar» (403 holati), so‘rov ketmaydi', async () => {
    signIn('technician', 't1');
    const hub = mockHub({});
    vi.stubGlobal('fetch', hub.fn);
    renderApp(
      <Routes>
        <Route
          path="/"
          element={
            <RequireLead>
              <StaffPage />
            </RequireLead>
          }
        />
      </Routes>,
    );
    expect(await screen.findByText(/faqat laboratoriya rahbari uchun/)).toBeInTheDocument();
    expect(hub.calls).toHaveLength(0);
  });

  it('xodim qo‘shish: vaqtinchalik parol bir marta ko‘rsatiladi; band telefon — aniq xato', async () => {
    signIn('lead');
    let attempt = 0;
    const hub = mockHub({
      'GET /v1/lab/users': () => ({ body: { users } }),
      'POST /v1/lab/users': () =>
        ++attempt === 1
          ? { status: 409, body: { error: { code: 'lab_user.phone_taken' } } }
          : { status: 201, body: { user: users[0], tempPassword: 'Tmp-Secret-12345' } },
    });
    vi.stubGlobal('fetch', hub.fn);
    renderApp(<StaffPage />);
    fireEvent.click(await screen.findByRole('button', { name: "+ Xodim qo'shish" }));
    fireEvent.change(screen.getByLabelText('F.I.Sh.'), { target: { value: 'Yangi Texnik' } });
    fireEvent.change(screen.getAllByLabelText('Telefon raqami')[0]!, {
      target: { value: '901234567' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Saqlash' }));
    expect(
      await screen.findByText("Bu telefon raqami allaqachon ro'yxatdan o'tgan."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Saqlash' }));
    expect(await screen.findByTestId('temp-password')).toHaveTextContent('Tmp-Secret-12345');
    expect(hub.calls.find((c) => c.method === 'POST')?.body).toMatchObject({
      fullName: 'Yangi Texnik',
      role: 'technician',
    });
  });

  it('prays-list: yangi qator narxi son bo‘lib yuboriladi', async () => {
    signIn('lead');
    const hub = mockHub({
      'GET /v1/lab/price-list': () => ({ body: { items: priceItems } }),
      'POST /v1/lab/price-list': () => ({ status: 201, body: { item: priceItems[0] } }),
    });
    vi.stubGlobal('fetch', hub.fn);
    renderApp(<PricesPage />);
    await screen.findByText('Toj');
    fireEvent.click(screen.getByRole('button', { name: "+ Qator qo'shish" }));
    fireEvent.change(screen.getByLabelText('Ish turi'), { target: { value: 'Vkladka' } });
    fireEvent.change(screen.getByLabelText('Material'), { target: { value: 'E.max' } });
    fireEvent.change(screen.getByLabelText('Narx'), { target: { value: '650000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Saqlash' }));
    await waitFor(() =>
      expect(hub.calls.find((c) => c.method === 'POST')?.body).toEqual({
        workType: 'Vkladka',
        material: 'E.max',
        price: 650000,
        isActive: true,
      }),
    );
  });
});
