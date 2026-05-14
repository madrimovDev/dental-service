/**
 * Standard API response envelope.
 * Backend va frontend ikkalasi shu shape'ni ishlatadi.
 */
export type ApiSuccess<T> = {
  success: true;
  data: T;
};

export type ApiError = {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export const ok = <T>(data: T): ApiSuccess<T> => ({ success: true, data });

export const fail = (code: string, message: string, details?: unknown): ApiError => ({
  success: false,
  error: { code, message, details },
});
