import { zValidator } from '@hono/zod-validator';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { SignJWT } from 'jose';
import { z } from 'zod';
import { db } from '../../db/client';
import { adminUsers } from '../../db/schema';
import { rateLimit } from '../../lib/rate-limit';

const secret = () => new TextEncoder().encode(process.env.JWT_SECRET!);

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const authRoutes = () => {
  const app = new Hono();

  // CLI-369: brute-force guard — 10 attempts / 15 min, keyed by IP + email.
  const loginRateLimit = rateLimit({
    name: 'login',
    limit: 10,
    windowSeconds: 900,
    keyFromBody: (b) =>
      typeof b === 'object' && b !== null && typeof (b as { email?: unknown }).email === 'string'
        ? (b as { email: string }).email
        : undefined,
  });

  app.post('/login', loginRateLimit, zValidator('json', loginSchema), async (c) => {
    const { email, password } = c.req.valid('json');
    const user = await db.query.adminUsers.findFirst({ where: eq(adminUsers.email, email) });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return c.json({ error: { code: 'INVALID_CREDENTIALS' } }, 401);
    }
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(user.id)
      .setIssuedAt()
      .setExpirationTime('7d')
      .sign(secret());
    return c.json({ token });
  });

  return app;
};
