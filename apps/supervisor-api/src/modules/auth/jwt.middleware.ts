import type { MiddlewareHandler } from 'hono';
import { jwtVerify } from 'jose';

const secret = () => new TextEncoder().encode(process.env.JWT_SECRET!);

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
