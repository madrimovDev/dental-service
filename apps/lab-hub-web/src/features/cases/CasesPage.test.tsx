import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { localISODate } from '@/lib/due';
import { AppShell } from '@/shell/AppShell';
import { useAuth } from '@/stores/auth';
import { mockHub, renderApp, signIn } from '../../test-utils';
import { CasesPage } from './CasesPage';
import { caseRow, detail, priceItems, users } from './fixtures';

const list = (rows = [caseRow()]) => ({
  body: { cases: rows, tabCounts: { new: 4, in_work: 13, ready: 3, shipped: 3, rejected: 1 } },
});

const baseRoutes = (over: Parameters<typeof mockHub>[0] = {}) =>
  mockHub({
    'GET /v1/lab/cases': () => list(),
    'GET /v1/lab/cases/c-231': () => ({ body: detail() }),
    'GET /v1/lab/users': () => ({ body: { users } }),
    'GET /v1/lab/price-list': () => ({ body: { items: priceItems } }),
    ...over,
  });

describe('CasesPage', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useRealTimers();
  });

  it('ro‘yxat: tab sonlari, ish, klinika, muddat chip‘i, holat', async () => {
    signIn('lead');
    const hub = baseRoutes({
      'GET /v1/lab/cases': () =>
        list([
          caseRow({ id: 'c-1', dueDate: localISODate(), status: 'in_progress' }),
          caseRow({ id: 'c-2', workType: 'Vkladka', status: 'sent', dueDate: null }),
        ]),
    });
    vi.stubGlobal('fetch', hub.fn);
    renderApp(<CasesPage />);
    const tabs = await screen.findByRole('tablist');
    expect(await within(tabs).findByRole('tab', { name: /Yangi\s*4/ })).toBeInTheDocument();
    expect(within(tabs).getByRole('tab', { name: /Ishda\s*13/ })).toBeInTheDocument();
    expect(await screen.findByText('Vkladka · sirkoniy')).toBeInTheDocument();
    expect(screen.getAllByText('Smile Dent (Chilonzor) · Dr. Yusupova').length).toBe(2);
    expect(screen.getByText('Bugun')).toBeInTheDocument(); // muddat chip
    expect(screen.getByText('Ishda', { selector: '[data-meaning]' })).toBeInTheDocument();
  });

  it('tab almashtirish — so‘rovga tab parametri ketadi', async () => {
    signIn('lead');
    const hub = baseRoutes();
    vi.stubGlobal('fetch', hub.fn);
    renderApp(<CasesPage />);
    fireEvent.click(await screen.findByRole('tab', { name: /Tayyor\s*3/ }));
    await waitFor(() => expect(hub.calls.some((c) => c.url.includes('tab=ready'))).toBe(true));
  });

  it('ish tanlanganda detal: bemor to‘liq ismi, tishlar, rang, fayllar, shifokor izohi, yozishma', async () => {
    signIn('lead');
    vi.stubGlobal('fetch', baseRoutes().fn);
    renderApp(<CasesPage />);
    fireEvent.click(await screen.findByRole('button', { name: /Ko‘prik · sirkoniy/ }));
    const aside = await screen.findByRole('complementary');
    expect(await within(aside).findByText(/Kamola Ergasheva/)).toBeInTheDocument();
    expect(within(aside).getByText(/SD-1187/)).toBeInTheDocument();
    expect(within(aside).getByText('A3')).toBeInTheDocument();
    expect(within(aside).getByText('34 · 35 · 36')).toBeInTheDocument();
    expect(within(aside).getByText('upper.stl')).toBeInTheDocument();
    expect(within(aside).getByText(/oraliq milkka tegmasin/)).toBeInTheDocument();
    expect(within(aside).getByText(/Antagonist skani ham qo‘shdim/)).toBeInTheDocument();
    // maxfiylik: telefon/manzil ko‘rinmaydi
    expect(within(aside).queryByText(/telefon:/i)).toBeNull();
  });

  it('texnik tanlash (lead) — assign so‘rovi', async () => {
    signIn('lead');
    const hub = baseRoutes({
      'POST /v1/lab/cases/c-231/assign': () => ({ body: { case: caseRow() } }),
    });
    vi.stubGlobal('fetch', hub.fn);
    renderApp(<CasesPage />, { route: '/?case=c-231' });
    const sel = await screen.findByLabelText('Texnik');
    await within(sel).findByRole('option', { name: /Shoxrux Olimov · 0 ta ishda/ });
    fireEvent.change(sel, { target: { value: 't1' } });
    await waitFor(() =>
      expect(hub.calls.find((c) => c.url.endsWith('/assign'))?.body).toEqual({
        technicianId: 't1',
      }),
    );
  });

  it('rad etish — sabab majburiy, so‘ng status=rejected + reason', async () => {
    signIn('lead');
    const hub = baseRoutes({
      'POST /v1/lab/cases/c-231/status': () => ({ body: { case: caseRow() } }),
    });
    vi.stubGlobal('fetch', hub.fn);
    renderApp(<CasesPage />, { route: '/?case=c-231' });
    fireEvent.click(await screen.findByRole('button', { name: 'Rad etish…' }));
    const dialog = await screen.findByRole('dialog');
    const confirm = within(dialog).getByRole('button', { name: 'Rad etish' });
    expect(confirm).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText('Rad etish sababi'), {
      target: { value: 'Skan sifatsiz' },
    });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    await waitFor(() =>
      expect(hub.calls.find((c) => c.url.endsWith('/status'))?.body).toEqual({
        to: 'rejected',
        reason: 'Skan sifatsiz',
      }),
    );
  });

  it("«Tayyor — jo'natishga» — status=ready", async () => {
    signIn('lead');
    const hub = baseRoutes({
      'POST /v1/lab/cases/c-231/status': () => ({ body: { case: caseRow() } }),
    });
    vi.stubGlobal('fetch', hub.fn);
    renderApp(<CasesPage />, { route: '/?case=c-231' });
    fireEvent.click(await screen.findByRole('button', { name: "Tayyor — jo'natishga" }));
    await waitFor(() =>
      expect(hub.calls.find((c) => c.url.endsWith('/status'))?.body).toEqual({ to: 'ready' }),
    );
  });

  it('narx taklifi: prays-listdan tanlansa narx to‘ldiriladi va yuboriladi', async () => {
    signIn('lead');
    const hub = baseRoutes({
      'POST /v1/lab/cases/c-231/price': () => ({ body: { case: caseRow() } }),
    });
    vi.stubGlobal('fetch', hub.fn);
    renderApp(<CasesPage />, { route: '/?case=c-231' });
    const pick = await screen.findByLabelText('Prays-listdan');
    await within(pick).findByRole('option', { name: /Ko‘prik · sirkoniy/ });
    fireEvent.change(pick, { target: { value: 'p1' } });
    const input = screen.getByLabelText('Taklif qilingan narx') as HTMLInputElement;
    expect(input.value.replace(/\D/g, '')).toBe('1800000');
    fireEvent.click(screen.getByRole('button', { name: 'Narxni taklif qilish' }));
    await waitFor(() =>
      expect(hub.calls.find((c) => c.url.endsWith('/price'))?.body).toEqual({
        price: 1800000,
        priceListItemId: 'p1',
      }),
    );
  });

  it('tasdiqlangan narx — o‘zgartirib bo‘lmaydi (forma yo‘q)', async () => {
    signIn('lead');
    const hub = baseRoutes({
      'GET /v1/lab/cases/c-231': () => ({
        body: detail({
          proposedPrice: '1800000.00',
          approvedPrice: '1800000.00',
          approvedAt: '2026-11-11T00:00:00.000Z',
        }),
      }),
    });
    vi.stubGlobal('fetch', hub.fn);
    renderApp(<CasesPage />, { route: '/?case=c-231' });
    expect(await screen.findByText(/Klinika tasdiqladi/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Narxni taklif qilish' })).toBeNull();
  });

  it('texnik roli: taqsimlash va narx yo‘q; holat tugmasi bor', async () => {
    signIn('technician', 't1');
    const hub = baseRoutes();
    vi.stubGlobal('fetch', hub.fn);
    renderApp(<CasesPage />, { route: '/?case=c-231' });
    expect(await screen.findByRole('button', { name: "Tayyor — jo'natishga" })).toBeInTheDocument();
    expect(screen.queryByLabelText('Texnik')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Narxni taklif qilish' })).toBeNull();
    // prays-list faqat narx taklif qiluvchi lead uchun yuklanadi
    expect(hub.calls.some((c) => c.url.includes('/v1/lab/price-list'))).toBe(false);
  });

  it('xabar yuborish', async () => {
    signIn('lead');
    const hub = baseRoutes({
      'POST /v1/lab/cases/c-231/messages': () => ({ status: 201, body: { message: { id: 'm9' } } }),
    });
    vi.stubGlobal('fetch', hub.fn);
    renderApp(<CasesPage />, { route: '/?case=c-231' });
    fireEvent.change(await screen.findByLabelText('Xabar'), { target: { value: 'Qabul qildim' } });
    fireEvent.click(screen.getByRole('button', { name: 'Yuborish' }));
    await waitFor(() =>
      expect(hub.calls.find((c) => c.url.endsWith('/messages'))?.body).toEqual({
        body: 'Qabul qildim',
      }),
    );
  });

  it('obuna imtiyoz davrida — ogohlantirish banneri', async () => {
    signIn('lead');
    useAuth.setState((s) => ({ lab: { ...s.lab!, subscription: 'grace' } }));
    vi.stubGlobal('fetch', baseRoutes().fn);
    renderApp(
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<CasesPage />} />
        </Route>
      </Routes>,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(/Obuna muddati tugagan/);
  });
});
