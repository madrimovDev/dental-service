import { randomUUID } from 'node:crypto';
import type { MiddlewareHandler } from 'hono';

declare module 'hono' {
  interface ContextVariableMap {
    requestId: string;
  }
}

export const requestId = (): MiddlewareHandler => async (c, next) => {
  const id = c.req.header('X-Request-Id') ?? randomUUID();
  c.set('requestId', id);
  c.header('X-Request-Id', id);
  await next();
};
