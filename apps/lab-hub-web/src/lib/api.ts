import { useAuth } from '@/stores/auth';

const BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '';

export class HubApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    public details?: unknown,
  ) {
    super(code);
    this.name = 'HubApiError';
  }
}

const sideEffects = (status: number, code: string) => {
  const auth = useAuth.getState();
  if (status === 401 && auth.token) auth.logout();
  if (status === 403 && code === 'auth.password_change_required') auth.setMustChangePassword(true);
  if (status === 403 && code === 'lab.subscription_expired') auth.setSubscription('expired');
};

async function send(method: string, path: string, body?: unknown): Promise<Response> {
  const headers = new Headers();
  const token = useAuth.getState().token;
  if (token) headers.set('Authorization', `Bearer ${token}`);
  let payload: BodyInit | undefined;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) {
    headers.set('Content-Type', 'application/json');
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${path}`, { method, headers, body: payload });
  if (!res.ok) {
    const j = (await res.json().catch(() => null)) as {
      error?: { code?: string; details?: unknown };
    } | null;
    const code = j?.error?.code ?? `http_${res.status}`;
    sideEffects(res.status, code);
    throw new HubApiError(res.status, code, j?.error?.details);
  }
  return res;
}

const json = async <T>(res: Response) =>
  res.status === 204 ? (undefined as T) : ((await res.json()) as T);

export const api = {
  get: async <T>(path: string) => json<T>(await send('GET', path)),
  post: async <T>(path: string, body?: unknown) => json<T>(await send('POST', path, body ?? {})),
  patch: async <T>(path: string, body: unknown) => json<T>(await send('PATCH', path, body)),
  del: async <T>(path: string) => json<T>(await send('DELETE', path)),
  upload: async <T>(path: string, form: FormData) => json<T>(await send('POST', path, form)),
  /** Himoyalangan fayl (Bearer kerak) — Blob sifatida. */
  blob: async (path: string) => (await send('GET', path)).blob(),
};
