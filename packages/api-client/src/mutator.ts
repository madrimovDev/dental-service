/**
 * Orval custom mutator — generated react-query hooks shu funksiya orqali so'rov yuboradi.
 * `client.ts` transport (auth header, 401 refresh+retry, throw on error)ni qayta ishlatadi.
 * `requestRaw` TO'LIQ `{success,data}` envelope qaytaradi — generated tip ham envelope.
 * Feature `api.ts` `.data` ni ochadi.
 *
 * Mutator statik named export — web auth-store'ni import qila olmaydi. Shuning uchun
 * modul-singleton: web `lib/api.ts` startup'da bir marta `configureClient(config)` chaqiradi.
 */
import { type ApiClient, type ApiClientConfig, createApiClient } from './client.ts';

let client: ApiClient | null = null;

export const configureClient = (config: ApiClientConfig): void => {
  client = createApiClient(config);
};

export const isClientConfigured = (): boolean => client !== null;

export type CustomInstanceConfig = {
  url: string;
  method: 'get' | 'post' | 'put' | 'patch' | 'delete';
  params?: Record<string, string | number | boolean | undefined>;
  data?: unknown;
  signal?: AbortSignal;
};

export const customInstance = async <T>(config: CustomInstanceConfig): Promise<T> => {
  if (!client) {
    throw new Error("api-client not configured — configureClient() ni startup'da chaqiring");
  }
  const qs = config.params
    ? `?${new URLSearchParams(
        Object.entries(config.params)
          .filter(([, v]) => v !== undefined)
          .map(([k, v]) => [k, String(v)]),
      ).toString()}`
    : '';
  const path = `${config.url}${qs}`;
  const method = config.method.toUpperCase();
  // requestRaw `{success,data}` envelope qaytaradi — generated T = envelope.
  return client.requestRaw(method, path, config.data) as Promise<T>;
};
