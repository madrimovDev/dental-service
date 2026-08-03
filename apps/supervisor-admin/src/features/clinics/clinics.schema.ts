import { z } from 'zod';

// Server-side createClinicSchema (apps/supervisor-api/src/modules/clinics/clinics.routes.ts:12-19)
// mirrored 1:1 for client-side @mantine/form validation via zod4Resolver.
export const createClinicFormSchema = z.object({
  name: z.string().min(1, 'Klinika nomi kiritilishi shart'),
  contactEmail: z.union([z.string().email("Email formati noto'g'ri"), z.literal('')]).optional(),
  contactPhone: z.string().optional(),
  plan: z.enum(['starter', 'standard', 'premium', 'enterprise'], {
    message: 'Tarifni tanlang',
  }),
  expiresAt: z.string().min(1, 'Amal qilish muddatini tanlang'),
  gracePeriodDays: z.number().int().min(1).max(365),
  // Provisioning — klinika lokal bazasida yaratiladigan birlamchi ma'lumot.
  // Telefon normalizatsiyasi (+998XXXXXXXXX) serverda bajariladi.
  ownerFullName: z.string().min(2, 'Owner F.I.Sh. kiritilishi shart'),
  ownerPhone: z.string().min(9, 'Owner telefoni kiritilishi shart'),
  defaultLanguage: z.enum(['uz', 'ru']),
  branchName: z.string().min(1, 'Filial nomi kiritilishi shart'),
  branchAddress: z.string().optional(),
  branchPhone: z.string().optional(),
});

export type CreateClinicFormValues = z.infer<typeof createClinicFormSchema>;
