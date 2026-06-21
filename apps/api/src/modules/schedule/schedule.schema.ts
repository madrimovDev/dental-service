import { z } from '@hono/zod-openapi';

// ─── Working hours (doctor_schedules) ───────────────────────────────────────

/** "HH:mm" 24-soatlik vaqt (00:00–23:59). */
const hhmm = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'HH:mm format kutilgan')
  .openapi({ example: '09:00' });

/** Bitta haftalik segment — request (wire) shakli "HH:mm" bilan. */
export const workingHoursSegmentSchema = z
  .object({
    weekday: z.number().int().min(0).max(6).openapi({ example: 1, description: '0=Sun..6=Sat' }),
    start: hhmm.openapi({ example: '09:00' }),
    end: hhmm.openapi({ example: '12:00' }),
    effectiveFrom: z.string().nullable().optional().openapi({ example: null }),
    effectiveUntil: z.string().nullable().optional().openapi({ example: null }),
  })
  .openapi('WorkingHoursSegment');
export type WorkingHoursSegmentInput = z.infer<typeof workingHoursSegmentSchema>;

/** PUT bulk-replace body — branch + barcha segmentlar. */
export const putWorkingHoursSchema = z
  .object({
    branchId: z.uuid(),
    segments: z.array(workingHoursSegmentSchema),
  })
  .openapi('PutWorkingHours');
export type PutWorkingHoursInput = z.infer<typeof putWorkingHoursSchema>;

/** Response segment DTO — id + isActive bilan. */
export const workingHoursSegmentDtoSchema = z
  .object({
    id: z.uuid(),
    doctorId: z.uuid(),
    branchId: z.uuid(),
    weekday: z.number().int().openapi({ example: 1 }),
    start: z.string().openapi({ example: '09:00' }),
    end: z.string().openapi({ example: '12:00' }),
    isActive: z.boolean().openapi({ example: true }),
    effectiveFrom: z.string().nullable().openapi({ example: null }),
    effectiveUntil: z.string().nullable().openapi({ example: null }),
  })
  .openapi('WorkingHoursSegmentDto');
export type WorkingHoursSegmentDto = z.infer<typeof workingHoursSegmentDtoSchema>;

/** GET working-hours query — optional branch filter. */
export const workingHoursQuerySchema = z.object({
  branchId: z.uuid().optional(),
});
export type WorkingHoursQuery = z.infer<typeof workingHoursQuerySchema>;

// ─── Time off (doctor_time_off) ─────────────────────────────────────────────

export const timeOffTypeSchema = z.enum(['vacation', 'sick', 'personal', 'other']);

export const createTimeOffSchema = z
  .object({
    doctorId: z.uuid(),
    branchId: z.uuid().nullable().optional().openapi({ description: 'null = barcha filiallar' }),
    type: timeOffTypeSchema.default('other'),
    startAt: z.iso.datetime(),
    endAt: z.iso.datetime(),
    reason: z.string().max(500).optional(),
  })
  .openapi('CreateTimeOff');
export type CreateTimeOffInput = z.infer<typeof createTimeOffSchema>;

export const listTimeOffQuerySchema = z.object({
  doctorId: z.uuid().optional(),
  branchId: z.uuid().optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
});
export type ListTimeOffQuery = z.infer<typeof listTimeOffQuerySchema>;

export const timeOffDtoSchema = z
  .object({
    id: z.uuid(),
    tenantId: z.uuid(),
    doctorId: z.uuid(),
    branchId: z.uuid().nullable().openapi({ example: null }),
    type: timeOffTypeSchema.openapi({ example: 'vacation' }),
    startAt: z.string().openapi({ example: '2026-06-22T04:00:00.000Z' }),
    endAt: z.string().openapi({ example: '2026-06-23T04:00:00.000Z' }),
    reason: z.string().nullable().openapi({ example: null }),
    createdBy: z.uuid().nullable().openapi({ example: null }),
    createdAt: z.string().openapi({ example: '2026-06-21T10:00:00.000Z' }),
  })
  .openapi('TimeOffDto');
export type TimeOffDto = z.infer<typeof timeOffDtoSchema>;

export const timeOffIdParamSchema = z
  .object({ id: z.uuid() })
  .openapi({ param: { name: 'id', in: 'path' } });

export const doctorIdParamSchema = z
  .object({ id: z.uuid() })
  .openapi({ param: { name: 'id', in: 'path' } });

// ─── Availability ───────────────────────────────────────────────────────────

export const availabilityQuerySchema = z.object({
  doctorId: z.uuid(),
  branchId: z.uuid(),
  /** Klinika-local kalendar kuni "YYYY-MM-DD" (instant emas — chegara aniqligi). */
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD format kutilgan')
    .openapi({ example: '2026-06-22' }),
  slotMinutes: z.coerce.number().int().min(5).max(480).default(30),
});
export type AvailabilityQuery = z.infer<typeof availabilityQuerySchema>;

export const availabilitySlotDtoSchema = z
  .object({
    start: z.string().openapi({ example: '2026-06-22T04:00:00.000Z' }),
    end: z.string().openapi({ example: '2026-06-22T04:30:00.000Z' }),
    startMinute: z.number().int().openapi({ example: 540 }),
    endMinute: z.number().int().openapi({ example: 570 }),
  })
  .openapi('AvailabilitySlot');
export type AvailabilitySlotDto = z.infer<typeof availabilitySlotDtoSchema>;

export const availabilityDtoSchema = z
  .object({
    doctorId: z.uuid(),
    branchId: z.uuid(),
    date: z.string().openapi({ example: '2026-06-22' }),
    slotMinutes: z.number().int().openapi({ example: 30 }),
    slots: z.array(availabilitySlotDtoSchema),
  })
  .openapi('Availability');
export type AvailabilityDto = z.infer<typeof availabilityDtoSchema>;
