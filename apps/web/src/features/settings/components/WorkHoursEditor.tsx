import { Group, Stack, Switch, TextInput } from '@mantine/core';
import { useTranslation } from 'react-i18next';

export const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type WorkHoursValue = Record<string, { open: string; close: string } | null>;

export const DEFAULT_WORK_HOURS: WorkHoursValue = {
  mon: { open: '09:00', close: '18:00' },
  tue: { open: '09:00', close: '18:00' },
  wed: { open: '09:00', close: '18:00' },
  thu: { open: '09:00', close: '18:00' },
  fri: { open: '09:00', close: '18:00' },
  sat: { open: '09:00', close: '18:00' },
  sun: null,
};

/** Filial ish soati muharriri (P10): har kun uchun ochiq/yopiq + ochilish/yopilish vaqti. */
export function WorkHoursEditor({
  value,
  onChange,
}: {
  value: WorkHoursValue;
  onChange: (next: WorkHoursValue) => void;
}) {
  const { t } = useTranslation();
  return (
    <Stack gap="xs" data-testid="work-hours-editor">
      {WEEKDAY_KEYS.map((day) => {
        const hours = value[day] ?? null;
        const label = t(`branches.days.${day}`);
        return (
          <Group key={day} gap="sm" wrap="nowrap" align="center">
            <Switch
              style={{ width: 150 }}
              label={label}
              aria-label={`${label} — ${t('branches.work_hours_open')}`}
              checked={hours !== null}
              onChange={(e) =>
                onChange({
                  ...value,
                  [day]: e.currentTarget.checked ? { open: '09:00', close: '18:00' } : null,
                })
              }
            />
            {hours ? (
              <>
                <TextInput
                  type="time"
                  aria-label={`${label} — ${t('branches.work_hours_open_time')}`}
                  value={hours.open}
                  onChange={(e) =>
                    onChange({ ...value, [day]: { ...hours, open: e.currentTarget.value } })
                  }
                />
                <TextInput
                  type="time"
                  aria-label={`${label} — ${t('branches.work_hours_close_time')}`}
                  value={hours.close}
                  onChange={(e) =>
                    onChange({ ...value, [day]: { ...hours, close: e.currentTarget.value } })
                  }
                />
              </>
            ) : (
              <span style={{ color: 'var(--ink-3)', fontSize: 13 }}>
                {t('branches.work_hours_closed')}
              </span>
            )}
          </Group>
        );
      })}
    </Stack>
  );
}
