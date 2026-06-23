import { Button, StateView } from '@dental/ui';
import { ActionIcon, Group, Paper, Stack, Text } from '@mantine/core';
import { TimeInput } from '@mantine/dates';
import { Plus, X } from 'lucide-react';
import type { CSSProperties } from 'react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/auth-store.ts';
import { useSaveWorkingHours, useWorkingHours } from '../schedule.api';
import { groupSegmentsByWeekday, newSegmentKey, toPutSegments } from '../schedule.mappers';
import type { EditableSegment, WeeklyHours } from '../schedule.types';

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0]; // Dushanba..Yakshanba (0=Sun oxirida)

// Dental OS chrome — har hafta kuni surface karta; yangi CSS fayl yo'q (scope=fayl ichi).
const dayCardStyle: CSSProperties = {
  background: 'var(--surface)',
  borderColor: 'var(--border)',
  borderRadius: 'var(--radius-md)',
};
const weekdayLabelStyle: CSSProperties = {
  color: 'var(--ink-3)',
  fontSize: 'var(--text-xs)',
  fontWeight: 'var(--fw-semibold)',
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
};

function emptyWeek(): WeeklyHours {
  const w: WeeklyHours = {};
  for (let i = 0; i <= 6; i += 1) w[i] = [];
  return w;
}

export function WeeklyHoursEditor({
  doctorId,
  branchId,
}: {
  doctorId: string | null;
  branchId: string | null;
}) {
  const { t } = useTranslation();
  const { hasPermission } = useAuthStore();
  const canManage = hasPermission('schedule.manage');
  const { data, isLoading, isError, refetch } = useWorkingHours(doctorId, branchId);
  const saveMut = useSaveWorkingHours();
  const [week, setWeek] = useState<WeeklyHours>(emptyWeek);

  useEffect(() => {
    setWeek(data ? groupSegmentsByWeekday(data) : emptyWeek());
  }, [data]);

  if (!doctorId) {
    return <StateView status="empty" title={t('schedule.select_doctor')} />;
  }
  if (!branchId) {
    return <StateView status="empty" title={t('schedule.select_branch')} />;
  }
  if (isLoading) return <StateView status="loading" skeleton="detail" />;
  if (isError) {
    return (
      <StateView
        status="error"
        title={t('states.error_title')}
        retryLabel={t('states.retry')}
        onRetry={() => refetch()}
      />
    );
  }

  const setSegment = (wd: number, idx: number, patch: Partial<EditableSegment>) => {
    setWeek((prev) => {
      const segs = [...(prev[wd] ?? [])];
      const cur = segs[idx];
      if (cur) segs[idx] = { ...cur, ...patch };
      return { ...prev, [wd]: segs };
    });
  };

  const addSegment = (wd: number) => {
    setWeek((prev) => ({
      ...prev,
      [wd]: [...(prev[wd] ?? []), { key: newSegmentKey(), start: '09:00', end: '13:00' }],
    }));
  };

  const removeSegment = (wd: number, idx: number) => {
    setWeek((prev) => ({ ...prev, [wd]: (prev[wd] ?? []).filter((_, i) => i !== idx) }));
  };

  const save = () => {
    if (!doctorId || !branchId) return;
    saveMut.mutate({ doctorId, branchId, segments: toPutSegments(week) });
  };

  return (
    <Stack gap="sm">
      {WEEKDAYS.map((wd) => (
        <Paper key={wd} withBorder p="md" style={dayCardStyle}>
          <Group align="flex-start" wrap="nowrap">
            <Text w={120} style={{ ...weekdayLabelStyle, flexShrink: 0, paddingTop: 6 }}>
              {t(`schedule.weekday.${wd}`)}
            </Text>
            <Stack gap="xs" style={{ flex: 1 }}>
              {(week[wd] ?? []).length === 0 && (
                <Text size="sm" c="dimmed">
                  {t('schedule.day_off')}
                </Text>
              )}
              {(week[wd] ?? []).map((seg, idx) => (
                <Group key={seg.key} gap="xs" wrap="nowrap">
                  <TimeInput
                    aria-label={t('schedule.start')}
                    value={seg.start}
                    disabled={!canManage}
                    onChange={(e) => setSegment(wd, idx, { start: e.currentTarget.value })}
                  />
                  <Text>—</Text>
                  <TimeInput
                    aria-label={t('schedule.end')}
                    value={seg.end}
                    disabled={!canManage}
                    onChange={(e) => setSegment(wd, idx, { end: e.currentTarget.value })}
                  />
                  {canManage && (
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      aria-label={t('schedule.remove_segment')}
                      onClick={() => removeSegment(wd, idx)}
                    >
                      <X size={16} />
                    </ActionIcon>
                  )}
                </Group>
              ))}
              {canManage && (
                <Button
                  variant="default"
                  size="sm"
                  iconLeft={<Plus size={14} />}
                  onClick={() => addSegment(wd)}
                >
                  {t('schedule.add_segment')}
                </Button>
              )}
            </Stack>
          </Group>
        </Paper>
      ))}
      {canManage && (
        <Group justify="flex-end">
          <Button variant="primary" disabled={saveMut.isPending} onClick={save}>
            {t('common.save')}
          </Button>
        </Group>
      )}
    </Stack>
  );
}
