import { z } from 'zod';

/**
 * Davr tanlovi sxemasi (zod4Resolver bilan). Range ikkala uchi ham tanlangan bo'lishi shart.
 * ⚠️ Zod 4 — `zod4Resolver` (`.issues`); plain `zodResolver` (`.errors`) crash qiladi (Qaror #12).
 */
export const periodFormSchema = z.object({
  period: z
    .tuple([z.date().nullable(), z.date().nullable()])
    .refine((v): v is [Date, Date] => v[0] !== null && v[1] !== null, {
      message: 'period_required',
    }),
});
export type PeriodFormSchema = z.infer<typeof periodFormSchema>;
