import type { CreateTimeOffType } from '@dental/api-client';
import { CreateTimeOffType as TimeOffTypeEnum } from '@dental/api-client';
import { Button } from '@dental/ui';
import { Group, Select, Stack, Textarea } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { useForm } from '@mantine/form';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { useTranslation } from 'react-i18next';
import { useCreateTimeOff } from '../schedule.api';
import { fullDayRangeToInstants, localDateParam } from '../schedule.mappers';
import { type TimeOffValues, timeOffSchema } from '../schedule.schema';

const TYPE_VALUES: CreateTimeOffType[] = Object.values(TimeOffTypeEnum);

export function TimeOffForm({
  doctorId,
  branchId,
  onDone,
}: {
  doctorId: string;
  branchId: string | null;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const createMut = useCreateTimeOff();

  const form = useForm<TimeOffValues>({
    initialValues: {
      doctorId,
      branchId,
      type: 'vacation',
      startDate: new Date(),
      endDate: new Date(),
      reason: '',
    },
    validate: zod4Resolver(timeOffSchema),
  });

  const typeOptions = TYPE_VALUES.map((v) => ({ value: v, label: t(`time_off.type.${v}`) }));

  const submit = form.onSubmit((values) => {
    const { startAt, endAt } = fullDayRangeToInstants(
      localDateParam(values.startDate),
      localDateParam(values.endDate),
    );
    createMut.mutate(
      {
        doctorId,
        branchId: values.branchId ?? null,
        type: values.type,
        startAt,
        endAt,
        reason: values.reason?.trim() || undefined,
      },
      { onSuccess: onDone },
    );
  });

  return (
    <form onSubmit={submit}>
      <Stack gap="sm">
        <Select
          label={t('time_off.type_label')}
          data={typeOptions}
          allowDeselect={false}
          {...form.getInputProps('type')}
        />
        <DatePickerInput
          label={t('time_off.start_date')}
          valueFormat="DD.MM.YYYY"
          {...form.getInputProps('startDate')}
        />
        <DatePickerInput
          label={t('time_off.end_date')}
          valueFormat="DD.MM.YYYY"
          {...form.getInputProps('endDate')}
        />
        <Textarea label={t('time_off.reason')} rows={2} {...form.getInputProps('reason')} />
        <Group justify="flex-end">
          <Button variant="default" onClick={onDone}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" type="submit" disabled={createMut.isPending}>
            {t('common.save')}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
