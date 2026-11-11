import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import { i18n } from '@/lib/i18n';
import { useAuth } from '@/stores/auth';

export type FetchCall = { url: string; method: string; body: unknown; headers: Headers };

/** `fetch` ni route-jadval bilan almashtiradi: kalit "METHOD /v1/path" (query'siz). */
export function mockHub(
  routes: Record<string, (call: FetchCall) => { status?: number; body?: unknown } | Response>,
) {
  const calls: FetchCall[] = [];
  const fn = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();
    let body: unknown;
    if (typeof init?.body === 'string') body = JSON.parse(init.body);
    else if (init?.body instanceof FormData) body = init.body;
    const call: FetchCall = { url, method, body, headers: new Headers(init?.headers) };
    calls.push(call);
    const key = `${method} ${url.split('?')[0]}`;
    const handler = routes[key];
    if (!handler)
      return new Response(JSON.stringify({ error: { code: 'not_found' } }), { status: 404 });
    const out = handler(call);
    if (out instanceof Response) return out;
    return new Response(JSON.stringify(out.body ?? {}), {
      status: out.status ?? 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  return { fn, calls };
}

export const signIn = (role: 'lead' | 'technician' = 'lead', sub = 'u-lead') =>
  useAuth.setState({
    token: 'test-token',
    mustChangePassword: false,
    user: {
      id: sub,
      fullName: 'Lab Rahbari',
      phone: '+998901112233',
      role,
      isActive: true,
      mustChangePassword: false,
      createdAt: '2026-11-01T00:00:00.000Z',
    },
    lab: { id: 'lab-1', name: 'Oq Tish laboratoriyasi', subscription: 'active' },
  });

export function renderApp(ui: ReactNode, { route = '/' }: { route?: string } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MantineProvider>
        <I18nextProvider i18n={i18n}>
          <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
        </I18nextProvider>
      </MantineProvider>
    </QueryClientProvider>,
  );
}
