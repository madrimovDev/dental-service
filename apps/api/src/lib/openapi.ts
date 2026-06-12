import { z } from '@hono/zod-openapi';

/**
 * `@dental/core` `ok(data)` = `{ success: true, data }` ni AKS ETTIRUVCHI wire-accurate
 * Zod envelope. OpenAPI response schema'si shu — generated tip ham shu envelope bo'ladi.
 */
export const apiResponseSchema = <T extends z.ZodTypeAny>(data: T) =>
  z.object({ success: z.literal(true), data });

/** `@dental/core` `fail(...)` envelope — barcha 4xx javoblar uchun (mutator throw yo'li). */
export const errorResponseSchema = z
  .object({
    success: z.literal(false),
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.unknown().optional(),
    }),
  })
  .openapi('ErrorResponse');

/**
 * `createRoute` `responses` builder — 200 success envelope + standart 400/401/403 error.
 * Modul route'lari shuni ishlatadi (DRY).
 */
export const okJson = <T extends z.ZodTypeAny>(schema: T, description: string) => ({
  200: {
    content: { 'application/json': { schema: apiResponseSchema(schema) } },
    description,
  },
  400: {
    content: { 'application/json': { schema: errorResponseSchema } },
    description: 'Validation error',
  },
  401: {
    content: { 'application/json': { schema: errorResponseSchema } },
    description: 'Unauthorized',
  },
  403: {
    content: { 'application/json': { schema: errorResponseSchema } },
    description: 'Forbidden',
  },
});
