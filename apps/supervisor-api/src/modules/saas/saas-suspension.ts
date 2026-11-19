import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '../../db/client';
import { clinicEvents, clinics } from '../../db/schema';

/**
 * FX-102 (LB-11) — SaaS klinikani vendor to'xtatishi (desktop `deactivate`
 * ekvivalenti). Migratsiyasiz: holat `clinic_events` jurnalidan olinadi —
 * eng oxirgi `saas_suspended` | `saas_renewed` hodisasi `saas_suspended` bo'lsa
 * klinika to'xtatilgan (`suspendedAt` = o'sha hodisa vaqti). «Muddatni
 * uzaytirish» (`saas_renewed`) to'xtatishni yechadi.
 *
 * apps/api `suspendedAt`ni sinxronda oladi va tenantni IMTIYOZSIZ bloklaydi;
 * Lab Hub holati `active=false`.
 */
type Exec = Pick<typeof db, 'select'>;

export const getSaasSuspendedAt = async (
  clinicId: string,
  exec: Exec = db,
): Promise<Date | null> => {
  const [last] = await exec
    .select({ event: clinicEvents.event, createdAt: clinicEvents.createdAt })
    .from(clinicEvents)
    .where(
      and(
        eq(clinicEvents.clinicId, clinicId),
        inArray(clinicEvents.event, ['saas_suspended', 'saas_renewed']),
      ),
    )
    .orderBy(desc(clinicEvents.createdAt))
    .limit(1);
  return last?.event === 'saas_suspended' ? last.createdAt : null;
};

/**
 * Idempotent: allaqachon to'xtatilgan bo'lsa yangi audit yozilmaydi, mavjud
 * `suspendedAt` qaytadi. Klinika qatori `FOR UPDATE` — parallel renew/suspend
 * ketma-ketlashadi (`renewSaasClinic` ham shu qatorni qulflaydi).
 */
export const suspendSaasClinic = async (clinicId: string, adminId?: string) =>
  db.transaction(async (tx) => {
    const [clinic] = await tx
      .select()
      .from(clinics)
      .where(and(eq(clinics.id, clinicId), eq(clinics.mode, 'saas')))
      .for('update');
    if (!clinic) throw Object.assign(new Error('CLINIC_NOT_FOUND'), { status: 404 });
    const existing = await getSaasSuspendedAt(clinicId, tx);
    if (existing) return { clinic, suspendedAt: existing };
    const [event] = await tx
      .insert(clinicEvents)
      .values({
        clinicId,
        event: 'saas_suspended',
        metadata: {
          subscriptionExpiresAt: clinic.subscriptionExpiresAt?.toISOString() ?? null,
          createdBy: adminId ?? null,
        },
      })
      .returning({ createdAt: clinicEvents.createdAt });
    if (!event) throw new Error('SUSPEND_FAILED');
    return { clinic, suspendedAt: event.createdAt };
  });
