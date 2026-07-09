import type { z } from '@hono/zod-openapi';
import type { noShowStrikeDtoSchema } from './no-show-strikes.schema.ts';

type StrikeRow = {
  id: string;
  appointmentId: string;
  waived: boolean;
  waivedReason: string | null;
  waivedAt: Date | null;
  createdAt: Date;
  appointmentStatus: string;
  startTime: Date;
};

/** Strike row → DTO (Date → ISO string). */
export const toNoShowStrikeDto = (row: StrikeRow): z.infer<typeof noShowStrikeDtoSchema> => ({
  id: row.id,
  appointmentId: row.appointmentId,
  waived: row.waived,
  waivedReason: row.waivedReason,
  waivedAt: row.waivedAt ? row.waivedAt.toISOString() : null,
  createdAt: row.createdAt.toISOString(),
  appointmentStatus: row.appointmentStatus,
  startTime: row.startTime.toISOString(),
});
