import crypto from 'node:crypto';
import { zValidator } from '@hono/zod-validator';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../../db/client';
import { branches, clinics, licenses } from '../../db/schema';
import { adminJwtMiddleware } from '../auth/jwt.middleware';

const createClinicSchema = z.object({
  name: z.string().min(1),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().optional(),
  plan: z.enum(['starter', 'standard', 'premium', 'enterprise']),
  expiresAt: z.string(), // ISO date
  gracePeriodDays: z.number().int().min(1).max(365).default(30),
});

// NOTE: brief's Step 2 snippet inserted a license with no branchId, but
// `licenses.branchId` is NOT NULL + FK -> branches (see db/schema.ts). A
// clinic needs at least one branch before a license row can exist at all
// (licenses.test.ts's own beforeEach does clinic -> branch -> license for
// the same reason). So POST / here auto-creates a "Main" branch for the
// new clinic, wrapped in a transaction so a mid-way failure never leaves
// an orphan clinic/branch row.
const MODULE_MAP: Record<z.infer<typeof createClinicSchema>['plan'], string[]> = {
  starter: ['patients', 'appointments', 'queue'],
  standard: ['patients', 'appointments', 'queue', 'cashier', 'reports', 'staff'],
  premium: [
    'patients',
    'appointments',
    'queue',
    'cashier',
    'reports',
    'staff',
    'clinical',
    'lab-orders',
    'patient-images',
    'prescriptions',
    'consent',
  ],
  enterprise: [
    'patients',
    'appointments',
    'queue',
    'cashier',
    'reports',
    'staff',
    'clinical',
    'lab-orders',
    'patient-images',
    'prescriptions',
    'consent',
    'erp',
    'payroll',
    'inventory',
    'branches',
  ],
};

export const clinicsRoutes = () => {
  const app = new Hono();
  app.use('*', adminJwtMiddleware);

  // Klinikalar ro'yxati
  app.get('/', async (c) => {
    const rows = await db.query.clinics.findMany();
    return c.json(rows);
  });

  // Yangi klinika + asosiy filial + litsenziya yaratish
  app.post('/', zValidator('json', createClinicSchema), async (c) => {
    const data = c.req.valid('json');

    const result = await db.transaction(async (tx) => {
      const [clinic] = await tx
        .insert(clinics)
        .values({
          name: data.name,
          contactEmail: data.contactEmail,
          contactPhone: data.contactPhone,
        })
        .returning();
      if (!clinic) throw new Error('clinic insert returned no row');

      const [branch] = await tx
        .insert(branches)
        .values({ clinicId: clinic.id, name: 'Main' })
        .returning();
      if (!branch) throw new Error('branch insert returned no row');

      // License key generatsiya: 4x5 char groups
      const key = Array.from({ length: 4 }, () =>
        crypto.randomBytes(3).toString('hex').toUpperCase().slice(0, 5),
      ).join('-');

      const [license] = await tx
        .insert(licenses)
        .values({
          clinicId: clinic.id,
          branchId: branch.id,
          licenseKey: key,
          plan: data.plan,
          modules: MODULE_MAP[data.plan],
          gracePeriodDays: data.gracePeriodDays,
          expiresAt: new Date(data.expiresAt),
          isActive: true,
        })
        .returning();
      if (!license) throw new Error('license insert returned no row');

      return { clinic, branch, license };
    });

    return c.json({ clinic: result.clinic, license: result.license });
  });

  // Klinika litsenziyasi + modullar
  app.get('/:id', async (c) => {
    const clinic = await db.query.clinics.findFirst({ where: eq(clinics.id, c.req.param('id')) });
    if (!clinic) return c.json({ error: { code: 'NOT_FOUND' } }, 404);
    const license = await db.query.licenses.findFirst({ where: eq(licenses.clinicId, clinic.id) });
    return c.json({ clinic, license });
  });

  return app;
};
