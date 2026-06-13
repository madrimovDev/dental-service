import { useDebouncedValue } from '@mantine/hooks';
import {
  Spotlight,
  type SpotlightActionData,
  type SpotlightActionGroupData,
} from '@mantine/spotlight';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { usePatients } from '@/features/patients/patients.api.ts';
import { useUsers, useVertical } from '@/features/settings/settings.api.ts';
import { useAuthStore } from '@/stores/auth-store.ts';
import { buildPatientActions, buildQuickActions, buildStaffActions } from './command-actions';
import { visibleGroups } from './nav-config';

export function CommandPalette() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { hasPermission } = useAuthStore();
  const vertical = useVertical();

  const [query, setQuery] = useState('');
  const [debounced] = useDebouncedValue(query, 250);
  const trimmed = debounced.trim();
  const canSearchPatients = hasPermission('patient.view');
  const canSearchStaff = hasPermission('user.view');
  const hasQuery = trimmed.length >= 2;

  const { data: patientsData } = usePatients(
    { search: trimmed, archived: false, page: 1, pageSize: 6 },
    { enabled: canSearchPatients && hasQuery },
  );
  // Xodimlar — listUserAssignments (user.view talab qiladi). RBAC: faqat ruxsat
  // bo'lganda va query bo'lsa olinadi (ruxsatsiz rolda 403 oldini oladi).
  const { data: staffData } = useUsers({ enabled: canSearchStaff && hasQuery });

  const navActions: SpotlightActionData[] = visibleGroups(hasPermission, vertical)
    .flatMap((g) => g.items)
    .filter((item) => !item.disabled)
    .map((item) => {
      const Icon = item.icon;
      return {
        id: `nav-${item.key}`,
        label: t(item.labelKey),
        leftSection: <Icon size={18} />,
        onClick: () => navigate(item.path),
      };
    });

  const quickActions: SpotlightActionData[] = buildQuickActions({
    t,
    navigate,
    has: hasPermission,
  }).map((a) => ({ id: a.id, label: a.label, onClick: a.onTrigger }));

  const patientActions: SpotlightActionData[] =
    canSearchPatients && hasQuery
      ? buildPatientActions(patientsData?.items ?? [], trimmed, navigate)
      : [];

  // Xodimlar — barcha assignment'lar olinadi, Spotlight client-side filtrlaydi.
  const staffActions: SpotlightActionData[] =
    canSearchStaff && hasQuery ? buildStaffActions(staffData ?? [], navigate) : [];

  const groups: SpotlightActionGroupData[] = [
    { group: t('palette.group.navigation'), actions: navActions },
    { group: t('palette.group.actions'), actions: quickActions },
  ];
  if (canSearchPatients) {
    groups.push({ group: t('palette.group.patients'), actions: patientActions });
  }
  if (canSearchStaff) {
    groups.push({ group: t('palette.group.staff'), actions: staffActions });
  }

  return (
    <Spotlight
      actions={groups.filter((g) => g.actions.length > 0)}
      query={query}
      onQueryChange={setQuery}
      shortcut="mod + K"
      nothingFound={t('palette.nothing_found')}
      highlightQuery
      searchProps={{ placeholder: t('shell.search_placeholder') }}
    />
  );
}
