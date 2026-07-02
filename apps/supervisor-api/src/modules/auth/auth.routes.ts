import { zValidator } from '@hono/zod-validator';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { SignJWT } from 'jose';
import { z } from 'zod';
import { db } from '../../db/client';
import { adminUsers } from '../../db/schema';

const secret = () => new TextEncoder().encode(process.env.JWT_SECRET!);

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const authRoutes = () => {
  const app = new Hono();

  app.post('/login', zValidator('json', loginSchema), async (c) => {
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
