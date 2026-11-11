import type { HubCasePayload } from './mapper.ts';

/**
 * Lab Hub HTTP klienti (klinika → Hub, faqat CHIQUVCHI so'rovlar — D1).
 *
 * Env har chaqiruvda qayta o'qiladi (frozen `env.ts` emas — `supervisor-saas.ts`
 * naqshi, testlar o'zgartira oladi):
 *  - `LAB_HUB_URL` — Hub manzili (prod'da HTTPS). Yo'q bo'lsa integratsiya o'chiq.
 *  - `LAB_HUB_SERVICE_TOKEN` — SaaS rejimida connect uchun xizmat kaliti
 *    (Hub'dagi `SAAS_HUB_TOKEN` bilan bir xil). Desktop'da kerak emas — litsenziya kaliti.
 */
const REQUEST_TIMEOUT_MS = 8000;
const UPLOAD_TIMEOUT_MS = 60_000;

export const labHubBaseUrl = (): string | null => {
  const raw = process.env.LAB_HUB_URL?.trim();
  return raw ? raw.replace(/\/+$/, '') : null;
};

export const isLabHubConfigured = (): boolean => labHubBaseUrl() !== null;

/**
 * `retryable` — tarmoq xatosi, 5xx, 429 va «keyinroq o'zgarishi mumkin» bo'lgan 401/403
 * (ulanish hali tasdiqlanmagan, obuna uzaytirilishi mumkin). Qolgan 4xx — doimiy.
 */
export class LabHubError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly retryable: boolean,
    readonly details?: unknown,
  ) {
    super(`lab-hub ${status} ${code}`);
    this.name = 'LabHubError';
  }
}

const RETRYABLE_4XX = new Set([
  'clinic.unauthorized',
  'clinic.subscription_expired',
  'lab.subscription_expired',
  'link.not_active',
  'rate_limited',
  'supervisor.unavailable',
]);

type FetchFn = typeof fetch;

type CallOpts = {
  method?: string;
  key?: string | null;
  json?: unknown;
  form?: FormData;
  timeoutMs?: number;
  fetchImpl?: FetchFn;
};

const request = async (path: string, opts: CallOpts = {}): Promise<Response> => {
  const base = labHubBaseUrl();
  if (!base) throw new LabHubError(0, 'lab_hub.not_configured', false);
  const headers: Record<string, string> = {};
  if (opts.key) headers.Authorization = `Bearer ${opts.key}`;
  let body: FormData | string | undefined;
  if (opts.form) body = opts.form;
  else if (opts.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.json);
  }
  let res: Response;
  try {
    res = await (opts.fetchImpl ?? fetch)(`${base}${path}`, {
      method: opts.method ?? 'GET',
      headers,
      body,
      signal: AbortSignal.timeout(opts.timeoutMs ?? REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    throw new LabHubError(0, 'lab_hub.unreachable', true, String(err));
  }
  if (res.ok) return res;
  let code = `http_${res.status}`;
  let details: unknown;
  try {
    const b = (await res.json()) as { error?: { code?: string; details?: unknown } };
    if (b.error?.code) code = b.error.code;
    details = b.error?.details;
  } catch {
    // tana JSON emas — status kodi yetarli
  }
  const retryable = res.status >= 500 || res.status === 429 || RETRYABLE_4XX.has(code);
  throw new LabHubError(res.status, code, retryable, details);
};

const json = async <T>(path: string, opts: CallOpts = {}): Promise<T> =>
  (await (await request(path, opts)).json()) as T;

export type HubLab = {
  id: string;
  name: string;
  city: string | null;
  description: string | null;
  linkStatus: string | null;
};

export type HubLink = {
  id: string;
  labId: string;
  labName: string;
  status: string;
  requestedAt: string;
  decidedAt: string | null;
};

export type HubChangeEvent = {
  seq: number;
  caseRef: string;
  labId: string;
  type: string;
  actor: 'clinic' | 'lab' | 'system';
  payload: Record<string, unknown>;
  createdAt: string;
  message: { id: string; author: string; authorName: string | null; body: string | null } | null;
  file: { id: string; fileName: string | null; mimeType: string; sizeBytes: number } | null;
};

export type ConnectProof =
  | { supervisorClinicId: string; licenseKey: string }
  | { supervisorClinicId: string; serviceProof: string };

const ref = (r: string) => encodeURIComponent(r);

export const labHubClient = (fetchImpl?: FetchFn) => ({
  connect: (proof: ConnectProof) =>
    json<{ clinicId: string; hubKey: string }>('/v1/clinic/connect', {
      method: 'POST',
      json: proof,
      fetchImpl,
    }),
  listLabs: (key: string) => json<{ labs: HubLab[] }>('/v1/clinic/labs', { key, fetchImpl }),
  requestLink: (key: string, labId: string) =>
    json<{ link: HubLink }>('/v1/clinic/links', {
      method: 'POST',
      key,
      json: { labId },
      fetchImpl,
    }),
  putCase: (key: string, caseRef: string, payload: HubCasePayload) =>
    json<{ caseId: string; status: string; created: boolean; applied: boolean }>(
      `/v1/clinic/cases/${ref(caseRef)}`,
      { method: 'PUT', key, json: payload, fetchImpl },
    ),
  /** `clientRef` — barqaror kalit (qayta yuborishda Hub mavjud faylni qaytaradi, 200). */
  uploadFile: (key: string, caseRef: string, file: File, clientRef?: string) => {
    const form = new FormData();
    form.set('file', file);
    if (clientRef) form.set('clientRef', clientRef);
    return json<{ file: { id: string } }>(`/v1/clinic/cases/${ref(caseRef)}/files`, {
      method: 'POST',
      key,
      form,
      timeoutMs: UPLOAD_TIMEOUT_MS,
      fetchImpl,
    });
  },
  downloadFile: (key: string, caseRef: string, fileId: string) =>
    request(`/v1/clinic/cases/${ref(caseRef)}/files/${encodeURIComponent(fileId)}`, {
      key,
      timeoutMs: UPLOAD_TIMEOUT_MS,
      fetchImpl,
    }),
  postMessage: (
    key: string,
    caseRef: string,
    body: string,
    authorName?: string | null,
    clientRef?: string,
  ) =>
    json<{ message: { id: string } }>(`/v1/clinic/cases/${ref(caseRef)}/messages`, {
      method: 'POST',
      key,
      json: {
        body,
        ...(authorName ? { authorName } : {}),
        ...(clientRef ? { clientRef } : {}),
      },
      fetchImpl,
    }),
  approvePrice: (key: string, caseRef: string, price: number) =>
    json<{ approvedPrice: string; approvedAt: string; alreadyApproved: boolean }>(
      `/v1/clinic/cases/${ref(caseRef)}/approve-price`,
      { method: 'POST', key, json: { price }, fetchImpl },
    ),
  delivered: (key: string, caseRef: string) =>
    json<{ status: string; changed: boolean }>(`/v1/clinic/cases/${ref(caseRef)}/delivered`, {
      method: 'POST',
      key,
      fetchImpl,
    }),
  changes: (key: string, since: string, limit: number) =>
    json<{ events: HubChangeEvent[]; nextCursor: string }>(
      `/v1/clinic/changes?since=${encodeURIComponent(since)}&limit=${limit}`,
      { key, fetchImpl },
    ),
});
