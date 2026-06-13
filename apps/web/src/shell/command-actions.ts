export type QuickAction = {
  id: string;
  label: string;
  onTrigger: () => void;
  permission?: string;
};

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
