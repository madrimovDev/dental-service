import {
  Button,
  Group,
  LoadingOverlay,
  Modal,
  NumberInput,
  Select,
  Stack,
  TextInput,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useForm } from '@mantine/form';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useStaffProfile, useUpsertProfile } from '../settings.api';
import { type StaffProfileFormValues, staffProfileSchema } from '../settings.schema';

/** Local sana → "YYYY-MM-DD" (timezone shift'siz). */
function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

const EMPTY: StaffProfileFormValues = {
  specialty: '',
  employmentStatus: 'active',
  startedAt: '',
  baseSalary: 0,
  commissionPercent: 0,
};

export function StaffProfileModal({
  userId,
  userName,
  onClose,
}: {
  userId: string;
  userName: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const profile = useStaffProfile(userId, true);
  const upsert = useUpsertProfile(userId);

  const form = useForm<StaffProfileFormValues>({
    initialValues: EMPTY,
    validate: zod4Resolver(staffProfileSchema),
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: faqat profil yuklanganda qayta to'ldiriladi
  useEffect(() => {
    const p = profile.data;
    if (p) {
      form.setValues({
        specialty: p.specialty ?? '',
        employmentStatus: p.employmentStatus,
        startedAt: p.startedAt ?? '',
        baseSalary: Number(p.baseSalary),
        commissionPercent: Number(p.commissionPercent),
      });
    } else if (profile.isFetched) {
      form.setValues(EMPTY);
    }
  }, [profile.data, profile.isFetched]);

  const submit = (v: StaffProfileFormValues) =>
    upsert.mutate(
      {
        specialty: v.specialty || undefined,
        employmentStatus: v.employmentStatus,
        startedAt: v.startedAt || undefined,
        baseSalary: v.baseSalary,
        commissionPercent: v.commissionPercent,
      },
      { onSuccess: () => onClose() },
    );

  const statusData: { value: StaffProfileFormValues['employmentStatus']; label: string }[] = [
    { value: 'active', label: t('staff.status_active') },
    { value: 'on_leave', label: t('staff.status_on_leave') },
    { value: 'inactive', label: t('staff.status_inactive') },
  ];

  return (
    <Modal opened onClose={onClose} title={`${t('staff.profile_title')}: ${userName}`}>
      <div style={{ position: 'relative' }}>
        <LoadingOverlay visible={profile.isLoading} />
        <form onSubmit={form.onSubmit(submit)}>
          <Stack gap="md">
            <TextInput label={t('staff.specialty')} {...form.getInputProps('specialty')} />
            <Select
              label={t('staff.status')}
              data={statusData}
              allowDeselect={false}
              {...form.getInputProps('employmentStatus')}
            />
            <DateInput
              label={t('staff.started_at')}
              valueFormat="DD.MM.YYYY"
              clearable
              value={form.values.startedAt ? new Date(form.values.startedAt) : null}
              onChange={(d: Date | null) => form.setFieldValue('startedAt', d ? toDateStr(d) : '')}
            />
            <NumberInput
              label={t('staff.base_salary')}
              min={0}
              thousandSeparator=" "
              {...form.getInputProps('baseSalary')}
            />
            <NumberInput
              label={t('staff.commission_percent')}
              min={0}
              max={100}
              suffix="%"
              {...form.getInputProps('commissionPercent')}
            />
            <Group justify="flex-end">
              <Button variant="default" onClick={onClose}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" loading={upsert.isPending}>
                {t('common.save')}
              </Button>
            </Group>
          </Stack>
        </form>
      </div>
    </Modal>
  );
}
