import type { MembershipsResponse } from '@dental/api-client/generated/model/membershipsResponse';
import { useDoctors } from '@/features/appointments/appointments.api';
import { useMe } from '@/features/auth/auth.api';
import { useAuthStore } from '@/stores/auth-store.ts';

/**
 * FX-155 review — klinik yozuv (vizit, retsept) muallifi.
 *
 * Server (`assertPractitioner`): muallif `roles.is_practitioner` shifokor (yoki tenant egasi)
 * bo'lishi shart; joriy foydalanuvchidan boshqa bo'lsa `*.on_behalf` kerak. Branch Manager /
 * Tenant Admin `prescription.manage`/`medical_record.edit` ga ega, lekin shifokor emas —
 * o'z nomidan yozsa 400 `ownership.not_practitioner`. Shuning uchun:
 *   - o'zi shifokor (yoki egasi) bo'lsa — o'z nomidan;
 *   - `on_behalf` bo'lsa — shifokor tanlagichi (`GET /appointments/doctors`);
 *   - ikkalasi ham bo'lmasa — yaratish tugmasi ko'rsatilmaydi.
 */
export type AuthorOption = { value: string; label: string };

export type ClinicalAuthor = {
  /** Joriy foydalanuvchi o'z nomidan muallif bo'la oladi. */
  canSelf: boolean;
  /** Boshqa shifokor nomidan yozish ruxsati (`*.on_behalf` yoki `@owner`). */
  canOnBehalf: boolean;
  /** Tanlanadigan mualliflar (o'zi birinchi). Bo'sh bo'lsa — yozuv yaratib bo'lmaydi. */
  options: AuthorOption[];
  /** Yozuv yaratish mumkinmi (kamida bitta muallif bor). */
  canAuthor: boolean;
  /** Tanlagich ko'rsatiladimi (bir nechta variant yoki o'zi muallif emas). */
  showPicker: boolean;
  /** Boshlang'ich muallif: o'zi; aks holda yagona variant; aks holda tanlash shart. */
  defaultDoctorId: string | null;
  isLoading: boolean;
};

type MeAssignment = MembershipsResponse['assignments'][number];
/** Generatsiya qilingan `/auth/me` shaklining tekshiruvga kerakli qismi (testlar qisman obyekt beradi). */
type MeLike = {
  assignments?: (Pick<MeAssignment, 'tenantId'> & Partial<Pick<MeAssignment, 'isPractitioner'>>)[];
  ownerTenants?: Pick<MembershipsResponse['ownerTenants'][number], 'tenantId'>[];
};

/** Joriy tenantda shifokor belgili faol tayinlov yoki tenant egasi. Noaniq bo'lsa — yo'q. */
export function isSelfPractitioner(
  me: MeLike | null | undefined,
  activeTenantId: string | null,
): boolean {
  if (!activeTenantId || !me) return false;
  if ((me.ownerTenants ?? []).some((t) => t.tenantId === activeTenantId)) return true;
  return (me.assignments ?? []).some(
    (a) => a.tenantId === activeTenantId && a.isPractitioner === true,
  );
}

export function resolveClinicalAuthor(input: {
  userId: string | null;
  selfLabel: string;
  canSelf: boolean;
  canOnBehalf: boolean;
  doctors: { id: string; name: string }[] | undefined;
}): Omit<ClinicalAuthor, 'isLoading'> {
  const { userId, selfLabel, canSelf, canOnBehalf } = input;
  const options: AuthorOption[] = [];
  if (canSelf && userId) options.push({ value: userId, label: selfLabel });
  if (canOnBehalf) {
    for (const d of input.doctors ?? []) {
      if (d.id !== userId) options.push({ value: d.id, label: d.name });
    }
  }
  const defaultDoctorId =
    canSelf && userId ? userId : options.length === 1 ? (options[0]?.value ?? null) : null;
  return {
    canSelf: canSelf && !!userId,
    canOnBehalf,
    options,
    canAuthor: options.length > 0,
    showPicker: options.length > 1 || (!canSelf && options.length > 0),
    defaultDoctorId,
  };
}

export function useClinicalAuthor(onBehalfPermission: string): ClinicalAuthor {
  const { user, hasPermission, activeTenantId, activeBranchId } = useAuthStore();
  const me = useMe();
  const canOnBehalf = hasPermission(onBehalfPermission);
  // Tanlagich manbasi `appointment.view` bilan ochiq — ruxsat yo'q bo'lsa so'ralmaydi (403 yo'q).
  const doctorsEnabled = canOnBehalf && hasPermission('appointment.view');
  const doctors = useDoctors(activeBranchId ?? undefined, { enabled: doctorsEnabled });
  const canSelf = isSelfPractitioner(me.data, activeTenantId ?? null);
  return {
    ...resolveClinicalAuthor({
      userId: user?.id ?? null,
      selfLabel: user?.fullName || user?.phone || '',
      canSelf,
      canOnBehalf,
      doctors: doctorsEnabled ? doctors.data : undefined,
    }),
    isLoading: me.isLoading || (doctorsEnabled && doctors.isLoading),
  };
}
