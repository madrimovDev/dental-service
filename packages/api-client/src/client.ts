import type { ApiResponse } from '@dental/core';

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export type RefreshResult = {
  accessToken: string;
  refreshToken: string;
};

export type ApiClientConfig = {
  baseUrl?: string;
  getAccessToken: () => string | null;
  getRefreshToken?: () => string | null;
  /**
   * Refresh token bilan yangi access olish funksiyasi.
   * Bo'lsa — 401 da auto-retry, bo'lmasa — to'g'ridan-to'g'ri onUnauthorized chaqiriladi.
   * Frontend bu funksiyani api-client setup'da auth-store bilan bog'laydi.
   */
  refreshTokens?: (refreshToken: string) => Promise<RefreshResult>;
  /** Refresh muvaffaqiyatli bo'lganda yangi tokenlarni saqlash uchun callback */
  onTokensRefreshed?: (tokens: RefreshResult) => void;
  /** Refresh ham fail bo'lsa yoki refresh tools mavjud bo'lmasa chaqiriladi */
  onUnauthorized?: () => void;
};

export const createApiClient = (config: ApiClientConfig) => {
  // Single-flight: bir vaqtda faqat bitta refresh ishlasin.
  // Bir nechta concurrent 401 bo'lsa, hammasi bitta refresh natijasini kutsin.
  let refreshPromise: Promise<RefreshResult | null> | null = null;

  const tryRefresh = async (): Promise<RefreshResult | null> => {
    if (!config.refreshTokens || !config.getRefreshToken) return null;
    const rt = config.getRefreshToken();
    if (!rt) return null;

    if (!refreshPromise) {
      refreshPromise = (async () => {
        try {
          const result = await config.refreshTokens?.(rt);
          if (result) config.onTokensRefreshed?.(result);
          return result ?? null;
        } catch {
          return null;
        } finally {
          // Allow next refresh after this resolves
          setTimeout(() => {
            refreshPromise = null;
          }, 0);
        }
      })();
    }
    return refreshPromise;
  };

  const parseResponse = async <T>(res: Response): Promise<ApiResponse<T>> => {
    const parsed = (await res.json().catch(() => null)) as ApiResponse<T> | null;
    if (!parsed) {
      throw new ApiError('http.invalid_response', 'Invalid response from server', res.status);
    }
    return parsed;
  };

  const handleParsed = <T>(parsed: ApiResponse<T>, status: number): T => {
    if (!parsed.success) {
      throw new ApiError(parsed.error.code, parsed.error.message, status, parsed.error.details);
    }
    return parsed.data;
  };

  const fetchWithAuth = async (
    method: string,
    path: string,
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<Response> => {
    const headers = new Headers();
    if (body !== undefined) headers.set('Content-Type', 'application/json');
    const token = config.getAccessToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return fetch(`${config.baseUrl ?? ''}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: 'include',
      signal,
    });
  };

  const fetchUpload = async (path: string, form: FormData): Promise<Response> => {
    const headers = new Headers();
    const token = config.getAccessToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return fetch(`${config.baseUrl ?? ''}${path}`, {
      method: 'POST',
      headers,
      body: form,
      credentials: 'include',
    });
  };

  // Shared: fetch + 401-refresh-retry. Returns parsed envelope + status (status needed for throw).
  const fetchEnvelope = async <T>(
    method: string,
    path: string,
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<{ parsed: ApiResponse<T>; status: number }> => {
    let res = await fetchWithAuth(method, path, body, signal);
    let parsed = await parseResponse<T>(res);
    if (!parsed.success && res.status === 401 && parsed.error.code === 'auth.invalid_token') {
      if (path !== '/api/auth/refresh') {
        const refreshed = await tryRefresh();
        if (refreshed) {
          res = await fetchWithAuth(method, path, body, signal);
          parsed = await parseResponse<T>(res);
        } else {
          config.onUnauthorized?.();
        }
      } else {
        config.onUnauthorized?.();
      }
    }
    return { parsed, status: res.status };
  };

  // Legacy: unwrapped data (hand-written endpoints.ts depends on this — DO NOT change behavior).
  const request = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
    const { parsed, status } = await fetchEnvelope<T>(method, path, body);
    return handleParsed<T>(parsed, status);
  };

  // Generated client: returns the FULL success envelope (throws on !success / non-2xx).
  const requestRaw = async <T>(
    method: string,
    path: string,
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<{ success: true; data: T }> => {
    const { parsed, status } = await fetchEnvelope<T>(method, path, body, signal);
    if (!parsed.success) {
      throw new ApiError(parsed.error.code, parsed.error.message, status, parsed.error.details);
    }
    return parsed;
  };

  const upload = async <T>(path: string, form: FormData): Promise<T> => {
    let res = await fetchUpload(path, form);
    let parsed = await parseResponse<T>(res);

    if (!parsed.success && res.status === 401 && parsed.error.code === 'auth.invalid_token') {
      const refreshed = await tryRefresh();
      if (refreshed) {
        res = await fetchUpload(path, form);
        parsed = await parseResponse<T>(res);
      } else {
        config.onUnauthorized?.();
      }
    }

    return handleParsed<T>(parsed, res.status);
  };

  return {
    get: <T>(path: string) => request<T>('GET', path),
    post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
    patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
    put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
    delete: <T>(path: string) => request<T>('DELETE', path),
    requestRaw,
    upload,
  };
};

export type ApiClient = ReturnType<typeof createApiClient>;
