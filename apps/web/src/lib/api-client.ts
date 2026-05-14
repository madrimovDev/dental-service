import type { ApiResponse } from '@dental/core';

/**
 * Placeholder fetch wrapper. M1.4 da OpenAPI auto-gen client bilan almashtiriladi.
 */
export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

export async function apiGet<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'GET',
    credentials: 'include',
    ...init,
  });

  const body = (await res.json()) as ApiResponse<T>;

  if (!body.success) {
    throw new ApiError(body.error.code, body.error.message, body.error.details);
  }

  return body.data;
}
