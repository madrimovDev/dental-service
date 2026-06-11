import { Button, Card, Input, Mono, Select } from '@dental/ui';
import { Badge, Group, SimpleGrid, Stack, Text, Textarea } from '@mantine/core';
import { useForm } from '@mantine/form';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { PhoneInput } from '@/components/PhoneInput.tsx';
import { useAuthStore } from '@/stores/auth-store.ts';
import { usePatientRaw, useUpdatePatient } from '../../patients.api';
import { patientEditSchema } from '../../patients.schema';
import type { PatientDetail } from '../../patients.types';

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Stack gap={2}>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text>{value}</Text>
    </Stack>
  );
}

function GeneralReadOnly({ patient }: { patient: PatientDetail }) {
  const { t } = useTranslation();
  const dash = '—';

  return (
    <Stack gap="md">
      <Card title={t('patients.form.section_main')}>
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
          <Field label={t('patients.form.full_name')} value={patient.fullName || dash} />
          <Field
            label={t('patients.form.date_of_birth')}
            value={
              patient.dateOfBirthFormatted ? <Mono>{patient.dateOfBirthFormatted}</Mono> : dash
            }
          />
          <Field label={t('patients.form.gender_label')} value={patient.genderLabel || dash} />
          <Field
            label={t('patients.form.phone')}
            value={patient.phone ? <Mono>{patient.phone}</Mono> : dash}
          />
          <Field
            label={t('patients.form.phone_secondary')}
            value={patient.phoneSecondary ? <Mono>{patient.phoneSecondary}</Mono> : dash}
          />
          <Field
            label={t('patients.form.passport')}
            value={patient.passport ? <Mono>{patient.passport}</Mono> : dash}
          />
          <Field label={t('patients.form.address')} value={patient.address || dash} />
          <Field label={t('patients.form.source')} value={patient.source || dash} />
        </SimpleGrid>

        {patient.notes && (
          <Stack gap={2} mt="md">
            <Text size="xs" c="dimmed">
              {t('patients.form.notes')}
            </Text>
            <Text>{patient.notes}</Text>
          </Stack>
        )}

        {patient.tags.length > 0 && (
          <Group gap="xs" mt="md">
            {patient.tags.map((tag) => (
              <Badge key={tag} variant="light">
                {tag}
              </Badge>
            ))}
          </Group>
        )}
      </Card>

      {patient.insurance && (
        <Card title={t('patients.form.insurance')}>
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            <Field
              label={t('patients.form.insurance_provider')}
              value={patient.insurance.provider || dash}
            />
            <Field
              label={t('patients.form.insurance_policy')}
              value={
                patient.insurance.policyNumber ? (
                  <Mono>{patient.insurance.policyNumber}</Mono>
                ) : (
                  dash
                )
              }
            />
          </SimpleGrid>
        </Card>
      )}
    </Stack>
  );
}

function GeneralEditForm({ patientId }: { patientId: string }) {
  const { t } = useTranslation();
  const rawQuery = usePatientRaw(patientId);
  const updateMut = useUpdatePatient(patientId);

  const form = useForm({
    initialValues: {
      fullName: '',
      dateOfBirth: '',
      gender: undefined as 'male' | 'female' | 'other' | undefined,
      phone: '',
      phoneSecondary: '',
      passport: '',
      address: '',
      notes: '',
    },
    validate: zod4Resolver(patientEditSchema),
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: form.setValues stable
  useEffect(() => {
    if (rawQuery.data) {
      const p = rawQuery.data;
      form.setValues({
        fullName: p.fullName,
        dateOfBirth: p.dateOfBirth ?? '',
        gender: p.gender ?? undefined,
        phone: p.phone ?? '',
        phoneSecondary: p.phoneSecondary ?? '',
        passport: p.passport ?? '',
        address: p.address ?? '',
        notes: p.notes ?? '',
      });
    }
  }, [rawQuery.data]);

  if (!rawQuery.data) {
    return <Text>{t('common.loading')}</Text>;
  }

  const submit = form.onSubmit((values) =>
    updateMut.mutate({
      fullName: values.fullName,
      gender: values.gender ?? null,
      dateOfBirth: values.dateOfBirth || null,
      phone: values.phone || null,
      phoneSecondary: values.phoneSecondary || null,
      passport: values.passport || null,
      address: values.address || null,
      notes: values.notes || null,
    }),
  );

  return (
    <Card title={t('patients.form.section_main')}>
      <form onSubmit={submit}>
        <Stack gap="md">
          <Input
            label={t('patients.form.full_name')}
            value={form.values.fullName}
            invalid={!!form.errors.fullName}
            onChange={(v) => form.setFieldValue('fullName', v)}
          />
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            <Input
              label={t('patients.form.date_of_birth')}
              type="date"
              value={form.values.dateOfBirth}
              onChange={(v) => form.setFieldValue('dateOfBirth', v)}
            />
            <Select
              label={t('patients.form.gender_label')}
              value={form.values.gender ?? null}
              onChange={(v) =>
                form.setFieldValue('gender', (v as 'male' | 'female' | 'other' | null) ?? undefined)
              }
              data={[
                { value: 'male', label: t('patients.gender.male') },
                { value: 'female', label: t('patients.gender.female') },
                { value: 'other', label: t('patients.gender.other') },
              ]}
            />
          </SimpleGrid>
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            <PhoneInput
              label={t('patients.form.phone')}
              value={form.values.phone}
              onChange={(v) => form.setFieldValue('phone', v)}
            />
            <PhoneInput
              label={t('patients.form.phone_secondary')}
              value={form.values.phoneSecondary}
              onChange={(v) => form.setFieldValue('phoneSecondary', v)}
            />
          </SimpleGrid>
          <Input
            label={t('patients.form.passport')}
            value={form.values.passport}
            onChange={(v) => form.setFieldValue('passport', v)}
          />
          <Input
            label={t('patients.form.address')}
            value={form.values.address}
            onChange={(v) => form.setFieldValue('address', v)}
          />
          <Textarea
            label={t('patients.form.notes')}
            rows={3}
            value={form.values.notes}
            onChange={(e) => form.setFieldValue('notes', e.currentTarget.value)}
          />
          <Group justify="flex-end">
            <Button type="submit" variant="primary" disabled={updateMut.isPending}>
              {t('common.save')}
            </Button>
          </Group>
        </Stack>
      </form>
    </Card>
  );
}

export function GeneralTab({ patient }: { patient: PatientDetail }) {
  const { hasPermission } = useAuthStore();

  if (hasPermission('patient.edit')) {
    return <GeneralEditForm patientId={patient.id} />;
  }

  return <GeneralReadOnly patient={patient} />;
}
