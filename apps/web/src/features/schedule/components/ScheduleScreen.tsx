import { PageHead, Tabs } from '@dental/ui';
import { Group, Select, Stack } from '@mantine/core';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useBranches, useDoctors } from '@/features/appointments/appointments.api';
import { useAuthStore } from '@/stores/auth-store.ts';
import { TimeOffList } from './TimeOffList';
import { WeeklyHoursEditor } from './WeeklyHoursEditor';

type Tab = 'hours' | 'timeoff';

export function ScheduleScreen() {
  const { t } = useTranslation();
  const { activeBranchId } = useAuthStore();
  const { data: doctors } = useDoctors();
  const { data: branches } = useBranches();
  const [tab, setTab] = useState<Tab>('hours');
  const [doctorId, setDoctorId] = useState<string | null>(null);
  const [branchId, setBranchId] = useState<string | null>(activeBranchId);

  const doctorOptions = useMemo(
    () => (doctors ?? []).map((d) => ({ value: d.id, label: d.name })),
    [doctors],
  );
  const branchOptions = useMemo(
    () => (branches ?? []).map((b) => ({ value: b.id, label: b.name })),
    [branches],
  );

  return (
    <div>
      <PageHead title={t('schedule.title')} />
      <Stack gap="md" mt="md">
        <Group gap="md">
          <Select
            label={t('schedule.doctor')}
            placeholder={t('schedule.select_doctor')}
            searchable
            data={doctorOptions}
            value={doctorId}
            onChange={setDoctorId}
            style={{ minWidth: 240 }}
          />
          <Select
            label={t('schedule.branch')}
            placeholder={t('schedule.select_branch')}
            searchable
            data={branchOptions}
            value={branchId}
            onChange={setBranchId}
            style={{ minWidth: 240 }}
          />
        </Group>
        <Tabs
          value={tab}
          onChange={(v) => setTab(v as Tab)}
          variant="pill"
          items={[
            { id: 'hours', label: t('schedule.tab_hours') },
            { id: 'timeoff', label: t('schedule.tab_timeoff') },
          ]}
        />
        {tab === 'hours' ? (
          <WeeklyHoursEditor doctorId={doctorId} branchId={branchId} />
        ) : (
          <TimeOffList doctorId={doctorId} branchId={branchId} />
        )}
      </Stack>
    </div>
  );
}
