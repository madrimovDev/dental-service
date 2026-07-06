import { z } from '@hono/zod-openapi';

// ─── Request schemas ──────────────────────────────────────────────────────────

export const createRunSchema = z
  .object({
    periodFrom: z.iso.date(),
    periodTo: z.iso.date(),
  })
  // CLI-417: teskari oraliqni (periodFrom > periodTo) rad et. ISO YYYY-MM-DD
  // leksikografik taqqoslash sana tartibi bilan mos → qo'shimcha parse shart emas.
  .refine((d) => d.periodFrom <= d.periodTo, {
    message: 'periodFrom must be <= periodTo',
    path: ['periodTo'],
  });
export type CreateRunInput = z.infer<typeof createRunSchema>;

export const runIdParamSchema = z
  .object({ id: z.uuid() })
  .openapi({ param: { name: 'id', in: 'path' } });

// ─── Response DTO schemas ─────────────────────────────────────────────────────

/**
 * PayrollLine DTO — numeric/decimal fields are STRINGS (Drizzle `numeric` → string).
 * Matches `PayrollLine` in `packages/api-client/src/types-hr.ts`.
 */
export const payrollLineDtoSchema = z
  .object({
    id: z.uuid(),
    tenantId: z.uuid(),
    runId: z.uuid(),
    userId: z.uuid().nullable(),
    baseSalary: z.string().openapi({ example: '5000000.00' }),
    attributedRevenue: z.string().openapi({ example: '12000000.00' }),
    commissionPercent: z.string().openapi({ example: '10.00' }),
    commissionAmount: z.string().openapi({ example: '1200000.00' }),
    total: z.string().openapi({ example: '6200000.00' }),
    createdAt: z.string().openapi({ example: '2026-06-12T10:00:00.000Z' }),
  })
  .openapi('PayrollLine');

export type PayrollLineDto = z.infer<typeof payrollLineDtoSchema>;

/**
 * PayrollRun DTO — `periodFrom`/`periodTo` are ISO date strings (Drizzle `date` → string).
 * Matches `PayrollRun` in `packages/api-client/src/types-hr.ts`.
 */
export const payrollRunDtoSchema = z
  .object({
    id: z.uuid(),
    tenantId: z.uuid(),
    periodFrom: z.string().openapi({ example: '2026-06-01' }),
    periodTo: z.string().openapi({ example: '2026-06-30' }),
    status: z.enum(['draft', 'finalized']).openapi({ example: 'draft' }),
    createdBy: z.uuid().nullable(),
    createdAt: z.string().openapi({ example: '2026-06-12T10:00:00.000Z' }),
  })
  .openapi('PayrollRun');

export type PayrollRunDto = z.infer<typeof payrollRunDtoSchema>;

/**
 * PayrollRunWithLines DTO — run + snapshot lines.
 * Matches `PayrollRunWithLines` in `packages/api-client/src/types-hr.ts`.
 */
export const payrollRunWithLinesDtoSchema = payrollRunDtoSchema
  .extend({
    lines: z.array(payrollLineDtoSchema),
  })
  .openapi('PayrollRunWithLines');

export type PayrollRunWithLinesDto = z.infer<typeof payrollRunWithLinesDtoSchema>;
