import crypto from 'node:crypto';
import { zValidator } from '@hono/zod-validator';
import { eq, inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../../db/client';
import { branches, clinics, licenseEvents, licenses } from '../../db/schema';
import { normalizePhone } from '../../lib/phone';
import { generateTempPassword } from '../../lib/temp-password';
import { adminJwtMiddleware } from '../auth/jwt.middleware';
import { createLicenseService } from '../licenses/licenses.service';

const uuidSchema = z.string().uuid();

/**
 * Klinika qatorining ochiq (parolsiz) ko'rinishi. `ownerTempPassword` ATAYIN
 * chiqarib tashlangan — u faqat ikki joyda ko'rinadi: yaratish javobidagi
 * `credentials` va `GET /:id` detali (spec §7, admin panel aktivatsiyagacha
 * operatorga ko'rsatadi).
 *
 * `...clinic` spread'i o'rniga aniq tanlash: `clinics` jadvaliga kelajakda
 * qo'shiladigan har qanday maxfiy ustun jim sizib chiqmasin.
 */
const pickClinicPublic = (clinic: typeof clinics.$inferSelect) => ({
  id: clinic.id,
  name: clinic.name,
  contactEmail: clinic.contactEmail,
  contactPhone: clinic.contactPhone,
  ownerFullName: clinic.ownerFullName,
  ownerPhone: clinic.ownerPhone,
  createdAt: clinic.createdAt,
});

const createClinicSchema = z.object({
  name: z.string().min(1),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().optional(),
  plan: z.enum(['starter', 'standard', 'premium', 'enterprise']),
  expiresAt: z.string(), // ISO date
  gracePeriodDays: z.number().int().min(1).max(365).default(30),
  // Provisioning — klinika lokal bazasida yaratiladigan birlamchi ma'lumot
  // (spec §5.2). Telefon `normalizePhone` bilan kanonik shaklga keltiriladi.
  ownerFullName: z.string().min(2).max(120),
  ownerPhone: z.string().min(9).max(20),
  defaultLanguage: z.enum(['uz', 'ru']).default('uz'),
  branchName: z.string().min(1).max(120).default('Bosh filial'),
  branchAddress: z.string().max(255).optional(),
  branchPhone: z.string().max(20).optional(),
});

// NOTE: brief's Step 2 snippet inserted a license with no branchId, but
// `licenses.branchId` is NOT NULL + FK -> branches (see db/schema.ts). A
// clinic needs at least one branch before a license row can exist at all
// (licenses.test.ts's own beforeEach does clinic -> branch -> license for
// the same reason). So POST / here auto-creates a "Main" branch for the
// new clinic, wrapped in a transaction so a mid-way failure never leaves
// an orphan clinic/branch row.
//
// CLI-433 — module-name dictionary reconciled with apps/api's actual route
// names (was `erp`/`inventory`/`branches`, which don't match any api route —
// api's gate would never have granted these even for enterprise). Now uses
// the same names as apps/api/src/lib/license-middleware.ts's MODULE_MAP
// (`expenses`/`stock`/`payroll`/`notifications`/`schedule`/`recalls`) — the
// two apps are separate deploy units (no workspace import edge,
// license-signature.ts precedent), kept in LOCKSTEP BY HAND. If you change
// this table, update apps/api's MODULE_MAP too (see its guard test).
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
    'expenses',
    'stock',
    'payroll',
    'notifications',
    'schedule',
    'recalls',
  ],
};

// `adminJwtMiddleware` (jwt.middleware.ts:17) tokenning `sub`'ini
// `adminUserId` deb yozadi. Hono instansiyasi tiplanmasa `c.get(...)`
// `never` beradi — audit `createdBy` uchun uni aniq e'lon qilamiz.
type AdminEnv = { Variables: { adminUserId?: string } };

export const clinicsRoutes = () => {
  const app = new Hono<AdminEnv>();
  const service = createLicenseService();
  app.use('*', adminJwtMiddleware);

  // Klinikalar ro'yxati + litsenziya summary (frontend ClinicsPage jadvali
  // litsenziya kaliti/tarif/holatni shu javobdan oladi — har-qator GET /:id
  // chaqiruvi (N+1) endi kerak emas, CLI-396). N+1 fixi treatment-plans
  // .repository.ts'dagi (apps/api) bir xil naqsh: parent-ro'yxat + bitta
  // IN-query + xotirada Map bo'yicha guruhlash.
  app.get('/', async (c) => {
    const rows = await db.query.clinics.findMany();
    if (rows.length === 0) return c.json([]);

    const licenseRows = await db
      .select({
        clinicId: licenses.clinicId,
        licenseKey: licenses.licenseKey,
        plan: licenses.plan,
        isActive: licenses.isActive,
        expiresAt: licenses.expiresAt,
      })
      .from(licenses)
      .where(
        inArray(
          licenses.clinicId,
          rows.map((r) => r.id),
        ),
      );

    // GET /:id (pastda) clinicId bo'yicha findFirst ishlatadi — orderBy yo'q,
    // birinchi topilgan qator. Bu yerda ham xuddi shu semantikani saqlaymiz.
    const licenseByClinic = new Map<string, (typeof licenseRows)[number]>();
    for (const l of licenseRows) {
      if (!licenseByClinic.has(l.clinicId)) licenseByClinic.set(l.clinicId, l);
    }

    const data = rows.map((clinic) => {
      const l = licenseByClinic.get(clinic.id);
      return {
        ...pickClinicPublic(clinic),
        license: l
          ? { licenseKey: l.licenseKey, plan: l.plan, isActive: l.isActive, expiresAt: l.expiresAt }
          : null,
      };
    });

    return c.json(data);
  });

  // Yangi klinika + asosiy filial + litsenziya yaratish
  app.post('/', zValidator('json', createClinicSchema), async (c) => {
    const data = c.req.valid('json');

    const result = await db.transaction(async (tx) => {
      const tempPassword = generateTempPassword();
      // Klinika tomonida bu telefon login identifikatori bo'ladi (CLAUDE.md
      // §3.1) — kanonik shakl `+998XXXXXXXXX`, aks holda mijoz kiritgan xom
      // qiymat login qidiruviga mos kelmaydi.
      const ownerPhone = normalizePhone(data.ownerPhone);

      const [clinic] = await tx
        .insert(clinics)
        .values({
          name: data.name,
          contactEmail: data.contactEmail,
          contactPhone: data.contactPhone,
          ownerFullName: data.ownerFullName,
          ownerPhone,
          ownerTempPassword: tempPassword,
          defaultLanguage: data.defaultLanguage,
        })
        .returning();
      if (!clinic) throw new Error('clinic insert returned no row');

      const [branch] = await tx
        .insert(branches)
        .values({
          clinicId: clinic.id,
          name: data.branchName,
          address: data.branchAddress ?? null,
          phone: data.branchPhone ? normalizePhone(data.branchPhone) : null,
        })
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

      return { clinic, branch, license, tempPassword };
    });

    // Parol AYNAN shu yerda va faqat shu yerda ochiq qaytariladi — hech qachon
    // loglanmaydi (spec §5.2). Klinika obyektining o'zi parolsiz.
    return c.json({
      clinic: pickClinicPublic(result.clinic),
      license: result.license,
      credentials: { loginPhone: result.clinic.ownerPhone, tempPassword: result.tempPassword },
    });
  });

  // Klinika litsenziyasi + modullar
  app.get('/:id', async (c) => {
    // `id` — uuid ustunga bog'lanadi; noto'g'ri formatdagi qiymat (masalan "new")
    // Postgres'ga uzatilsa "invalid input syntax for type uuid" bilan 500 beradi.
    // Formatni oldindan tekshirib, noto'g'ri bo'lsa 404 (mavjud emas) qaytaramiz.
    const idResult = uuidSchema.safeParse(c.req.param('id'));
    if (!idResult.success) return c.json({ error: { code: 'NOT_FOUND' } }, 404);

    const clinic = await db.query.clinics.findFirst({ where: eq(clinics.id, idResult.data) });
    if (!clinic) return c.json({ error: { code: 'NOT_FOUND' } }, 404);
    const license = await db.query.licenses.findFirst({ where: eq(licenses.clinicId, clinic.id) });
    // ATAYIN xom qator (`ownerTempPassword` bilan) — admin panel detali
    // aktivatsiyagacha vaqtinchalik parolni operatorga ko'rsatadi (spec §7).
    // Bu yerda `pickClinicPublic` ISHLATILMAYDI; "tozalash" niyatida
    // almashtirmang, aks holda panel holati jim buziladi (clinics.test.ts
    // "GET /:id (detal) ... ATAYIN bor" testi buni qulflaydi).
    return c.json({ clinic, license });
  });

  // Litsenziyani bekor qilish (revoke) — vendor operatori to'lamayotgan/shartnoma
  // tugagan klinikani deaktivatsiya qiladi. isActive:false keyingi
  // activate/heartbeat'ni licenses.service.ts'dagi mavjud guard orqali 403
  // bilan rad etadi (bu yerda qo'shimcha tekshiruv shart emas).
  app.patch('/:id/deactivate', async (c) => {
    const idResult = uuidSchema.safeParse(c.req.param('id'));
    if (!idResult.success) return c.json({ error: { code: 'NOT_FOUND' } }, 404);

    const clinic = await db.query.clinics.findFirst({ where: eq(clinics.id, idResult.data) });
    if (!clinic) return c.json({ error: { code: 'NOT_FOUND' } }, 404);

    const license = await db.query.licenses.findFirst({ where: eq(licenses.clinicId, clinic.id) });
    if (!license) return c.json({ error: { code: 'NOT_FOUND' } }, 404);

    await db.update(licenses).set({ isActive: false }).where(eq(licenses.id, license.id));
    await db.insert(licenseEvents).values({
      licenseId: license.id,
      event: 'deactivated',
    });

    const updatedLicense = await db.query.licenses.findFirst({
      where: eq(licenses.id, license.id),
    });
    return c.json({ clinic: pickClinicPublic(clinic), license: updatedLicense });
  });

  // Qayta o'rnatishga tayyorlash (audit C1) — mijoz mashinasi almashsa yoki
  // lokal baza yo'qolsa. Yangi vaqtinchalik parol + fingerprint tozalash BIRGA
  // (licenses.service.ts `prepareReinstall` izohiga qarang).
  app.post('/:id/prepare-reinstall', async (c) => {
    const idResult = uuidSchema.safeParse(c.req.param('id'));
    if (!idResult.success) return c.json({ error: { code: 'NOT_FOUND' } }, 404);

    const adminId = c.get('adminUserId');
    try {
      const credentials = await service.prepareReinstall(idResult.data, adminId);
      return c.json({ credentials });
    } catch (err) {
      const code = err instanceof Error ? err.message : 'UNKNOWN';
      const status = (err as { status?: number }).status ?? 500;
      return c.json({ error: { code } }, status as 400 | 404 | 500);
    }
  });

  return app;
};
