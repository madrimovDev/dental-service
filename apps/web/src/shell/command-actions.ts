export type QuickAction = {
  id: string;
  label: string;
  onTrigger: () => void;
  permission?: string;
};

/** Qidiruv natijasi (bemor/xodim) — SpotlightActionData kichik to'plami. */
export type SearchResultAction = {
  id: string;
  label: string;
  description?: string;
  keywords?: string;
  onClick: () => void;
};

export type PatientLite = { id: string; fullName: string; phone?: string | null };
export type StaffLite = { userId: string; userFullName: string | null; userPhone: string };

/** Bemor qidiruv natijalari → palette amallari. */
export function buildPatientActions(
  patients: PatientLite[],
  trimmed: string,
  navigate: (path: string) => void,
): SearchResultAction[] {
  return patients.map((p) => ({
    id: `patient-${p.id}`,
    label: p.fullName,
    description: p.phone ?? undefined,
    // CLI-152: server allaqachon filtrlagan (transliteratsiya) — natijalarni
    // client-side default filtrdan o'tkazib yuborish uchun keywords=query.
    keywords: trimmed,
    onClick: () => navigate(`/patients/${p.id}`),
  }));
}

/** Xodim qidiruv natijalari → palette amallari (userId bo'yicha dedupe). */
export function buildStaffActions(
  staff: StaffLite[],
  navigate: (path: string) => void,
): SearchResultAction[] {
  // bir xodim bir necha filialda bo'lishi mumkin → userId bo'yicha yagonalashtirish
  const unique = [...new Map(staff.map((s) => [s.userId, s])).values()];
  return unique.map((s) => ({
    id: `staff-${s.userId}`,
    label: s.userFullName ?? s.userPhone,
    description: s.userPhone,
    onClick: () => navigate('/settings/users'),
  }));
}

export function buildQuickActions(deps: {
  t: (k: string) => string;
  navigate: (path: string) => void;
  has: (p: string) => boolean;
}): QuickAction[] {
  const { t, navigate, has } = deps;
  const all: QuickAction[] = [
    {
      id: 'new-patient',
      label: t('palette.new_patient'),
      permission: 'patient.create',
      onTrigger: () => navigate('/patients/new'),
    },
    {
      id: 'new-appointment',
      label: t('palette.new_appointment'),
      permission: 'appointment.create',
      onTrigger: () => navigate('/appointments'),
    },
    {
      id: 'open-cashier',
      label: t('palette.open_cashier'),
      permission: 'cashier.view',
      onTrigger: () => navigate('/cashier'),
    },
  ];
  return all.filter((a) => !a.permission || has(a.permission));
}
