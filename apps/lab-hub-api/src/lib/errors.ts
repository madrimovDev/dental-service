import type { ContentfulStatusCode } from 'hono/utils/http-status';

/** Servis qatlami xatosi — `app.onError` uni `{ error: { code } }` ga aylantiradi. */
export class ApiError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: string,
    readonly details?: unknown,
  ) {
    super(code);
  }
}

export const notFound = (what = 'resource') => new ApiError(404, `${what}.not_found`);
