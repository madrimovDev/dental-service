import type { MiddlewareHandler } from 'hono';
import { jwtVerify } from 'jose';

const secret = () => {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) throw new Error('JWT_SECRET is required');
  return new TextEncoder().encode(jwtSecret);
};

export const adminJwtMiddleware: MiddlewareHandler = async (c, next) => {
  const auth = c.req.header('Authorization');
  if (!auth?.startsWith('Bearer ')) {
    return c.json({ error: { code: 'UNAUTHORIZED' } }, 401);
  }
  try {
    const { payload } = await jwtVerify(auth.slice(7), secret());
    c.set('adminUserId', payload.sub);
    await next();
  } catch {
    return c.json({ error: { code: 'UNAUTHORIZED' } }, 401);
  }
};
