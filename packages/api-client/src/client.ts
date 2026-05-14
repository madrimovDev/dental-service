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

export type ApiClientConfig = {
  baseUrl?: string;
  getAccessToken: () => string | null;
  onUnauthorized?: () => void;
};

export const createApiClient = (config: ApiClientConfig) => {
  const request = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
    const headers = new Headers();
    if (body !== undefined) headers.set('Content-Type', 'application/json');
    const token = config.getAccessToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);

    const res = await fetch(`${config.baseUrl ?? ''}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: 'include',
    });

    const parsed = (await res.json().catch(() => null)) as ApiResponse<T> | null;

    if (!parsed) {
      throw new ApiError('http.invalid_response', 'Invalid response from server', res.status);
    }

    if (!parsed.success) {
      if (res.status === 401 && parsed.error.code === 'auth.invalid_token') {
        config.onUnauthorized?.();
      }
      throw new ApiError(parsed.error.code, parsed.error.message, res.status, parsed.error.details);
    }

    return parsed.data;
  };

  return {
    get: <T>(path: string) => request<T>('GET', path),
    post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
    patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
    put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
    delete: <T>(path: string) => request<T>('DELETE', path),
  };
};

export type ApiClient = ReturnType<typeof createApiClient>;
