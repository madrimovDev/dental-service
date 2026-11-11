import { OpenAPIHono } from '@hono/zod-openapi';
import type { Env } from 'hono';

/**
 * Javoblar `content`siz e'lon qilinadi — handler oddiy `c.json` qaytaradi;
 * so'rov sxemalari esa OpenAPI'ga va runtime validatsiyaga tushadi.
 */
export const OK = { 200: { description: 'OK' } } as const;

export const jsonBody = <T>(schema: T) => ({
  content: { 'application/json': { schema } },
  required: true as const,
});

/** Validatsiya xatosi — `{ error: { code: 'validation', details } }` 400. */
export const createRouter = <E extends Env = Env>() =>
  new OpenAPIHono<E>({
    defaultHook: (result, c) => {
      if (!result.success) {
        return c.json(
          {
            error: {
              code: 'validation',
              details: result.error.issues.map((i) => ({ path: i.path, message: i.message })),
            },
          },
          400,
        );
      }
    },
  });
