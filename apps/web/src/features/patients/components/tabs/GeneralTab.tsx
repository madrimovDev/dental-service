import { Button, Card, Input, Mono, Select, StateView } from '@dental/ui';
import { Badge, Checkbox, Group, SimpleGrid, Stack, Text, Textarea } from '@mantine/core';
import { useForm } from '@mantine/form';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { PhoneInput } from '@/components/PhoneInput.tsx';
import { useAuthStore } from '@/stores/auth-store.ts';
import { usePatientRaw, useUpdatePatient } from '../../patients.api';
import { patientEditSchema } from '../../patients.schema';
import type { PatientDetail } from '../../patients.types';
import { NoShowStrikesCard } from '../NoShowStrikesCard';

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Stack gap={2}>
      <Text
        style={{
          fontSize: '11.5px',
          color: 'var(--ink-3)',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}
      >
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
        <Card
          title={t('patients.form.insurance')}
          actions={
            <Badge
              color={
                patient.insuranceStatus === 'active'
                  ? 'teal'
                  : patient.insuranceStatus === 'expired'
                    ? 'red'
                    : 'gray'
              }
            >
              {t(`patients.insurance_status.${patient.insuranceStatus}`)}
            </Badge>
          }
        >
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
            <Field
              label={t('patients.form.insurance_coverage')}
              value={
                patient.insurance.coverageType
                  ? t(`patients.form.coverage_${patient.insurance.coverageType}`)
                  : dash
              }
            />
            <Field
              label={t('patients.form.insurance_expiry')}
              value={patient.insurance.expiryDate || dash}
            />
          </SimpleGrid>
        </Card>
      )}
    </Stack>
  );
}

/** PT-04: `patient.view_pii`siz serverdan maskalangan (`***`) qiymat keladi — tahrirlanmaydi, yuborilmaydi. */
const PII_FORM_FIELDS = ['phone', 'phoneSecondary', 'passport', 'address'] as const;

function GeneralEditForm({ patientId }: { patientId: string }) {
  const { t } = useTranslation();
  const { hasPermission } = useAuthStore();
  const canEditPii = hasPermission('patient.view_pii');
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
      allowEmergencyRecall: false,
    },
    // PT-04: maskalangan PII maydonlari formatga mos kelmaydi — ular tahrirlanmaydi,
    // shuning uchun validatsiya xatosi ham bloklamasligi kerak.
    validate: (values) => {
      const errors = zod4Resolver(patientEditSchema)(values);
      if (!canEditPii) for (const f of PII_FORM_FIELDS) delete errors[f];
      return errors;
    },
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
        allowEmergencyRecall: p.allowEmergencyRecall,
      });
    }
  }, [rawQuery.data]);

  // CLI-467: avval faqat `!rawQuery.data` tekshirilardi — xato holatida ham
  // cheksiz "loading" matni chiqardi (isLoading/isError ajratilmagan edi).
  if (rawQuery.isLoading) {
    return <StateView status="loading" skeleton="detail" />;
  }
  if (rawQuery.isError) {
    return (
      <StateView
        status="error"
        title={t('states.error_title')}
        retryLabel={t('states.retry')}
        onRetry={() => rawQuery.refetch()}
      />
    );
  }
  if (!rawQuery.data) {
    return null;
  }

  // CLI-455 (frontend qismi) + PT-04: faqat O'ZGARGAN maydonlar yuboriladi.
  // Original (serverdan yuklangan) qiymat bilan solishtiramiz:
  //  - joriy original bilan bir xil → undefined (o'zgarish yo'q, PATCH kalitni tashlaydi)
  //  - joriy '' lekin original qiymatga ega edi → null (foydalanuvchi ANIQ bo'shatdi)
  //  - aks holda joriy qiymat
  // Maskalangan PII (`view_pii`siz) HECH QACHON yuborilmaydi — aks holda `***` haqiqiy
  // qiymat ustiga yozilib qolardi.
  // Generated `UpdatePatientBody` hali `null` qabul qilmaydi — tor `as` kasting
  // (api-client regenerate qilingach olib tashlanadi).
  const original = rawQuery.data;
  const changed = (current: string, prev: string | null | undefined) => {
    if (current === (prev ?? '')) return undefined;
    return (current === '' ? null : current) as string | undefined;
  };
  const piiChanged = (current: string, prev: string | null | undefined) =>
    canEditPii ? changed(current, prev) : undefined;

  const submit = form.onSubmit((values) =>
    updateMut.mutate({
      fullName: values.fullName,
      gender: values.gender ?? undefined,
      dateOfBirth: changed(values.dateOfBirth, original.dateOfBirth),
      phone: piiChanged(values.phone, original.phone),
      phoneSecondary: piiChanged(values.phoneSecondary, original.phoneSecondary),
      passport: piiChanged(values.passport, original.passport),
      address: piiChanged(values.address, original.address),
      notes: changed(values.notes, original.notes),
      allowEmergencyRecall: values.allowEmergencyRecall,
    }),
  );

  return (
    <Card title={t('patients.form.section_main')}>
      <form onSubmit={submit}>
        <Stack gap="md">
          <Input
            label={t('patients.form.full_name')}
            value={form.values.fullName}
            error={form.errors.fullName}
            onChange={(v) => form.setFieldValue('fullName', v)}
          />
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            <Input
              label={t('patients.form.date_of_birth')}
              type="date"
              value={form.values.dateOfBirth}
              error={form.errors.dateOfBirth}
              onChange={(v) => form.setFieldValue('dateOfBirth', v)}
            />
            <Select
              label={t('patients.form.gender_label')}
              value={form.values.gender ?? null}
              error={form.errors.gender}
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
            {/* L13: patientEditSchema endi telefon formatini tekshiradi — error endi wire qilingan
                (aks holda noto'g'ri format kiritilganda submit jim bloklanardi). */}
            {canEditPii ? (
              <>
                <PhoneInput label={t('patients.form.phone')} {...form.getInputProps('phone')} />
                <PhoneInput
                  label={t('patients.form.phone_secondary')}
                  {...form.getInputProps('phoneSecondary')}
                />
              </>
            ) : (
              <>
                <Input label={t('patients.form.phone')} value={form.values.phone} disabled />
                <Input
                  label={t('patients.form.phone_secondary')}
                  value={form.values.phoneSecondary}
                  disabled
                />
              </>
            )}
          </SimpleGrid>
          <Input
            label={t('patients.form.passport')}
            value={form.values.passport}
            error={form.errors.passport}
            disabled={!canEditPii}
            onChange={(v) => form.setFieldValue('passport', v)}
          />
          <Input
            label={t('patients.form.address')}
            value={form.values.address}
            error={form.errors.address}
            disabled={!canEditPii}
            onChange={(v) => form.setFieldValue('address', v)}
          />
          {!canEditPii && (
            <Text size="xs" c="dimmed" data-testid="pii-readonly-hint">
              {t('patientsList.pii_readonly_hint')}
            </Text>
          )}
          <Textarea
            label={t('patients.form.notes')}
            rows={3}
            value={form.values.notes}
            onChange={(e) => form.setFieldValue('notes', e.currentTarget.value)}
          />
          {/* CLI-474 (L8): favqulodda aloqaga recall/reminder fallback roziligi. */}
          <Checkbox
            label={t('patients.form.allow_emergency_recall')}
            description={t('patients.form.allow_emergency_recall_hint')}
            checked={form.values.allowEmergencyRecall}
            onChange={(e) => form.setFieldValue('allowEmergencyRecall', e.currentTarget.checked)}
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

  return (
    <Stack gap="md">
      {hasPermission('patient.edit') ? (
        <GeneralEditForm patientId={patient.id} />
      ) : (
        <GeneralReadOnly patient={patient} />
      )}
      {/* CLI-474 (L7): no-show strike xulosasi (chegara/strike bo'lmasa yashirin). */}
      <NoShowStrikesCard patientId={patient.id} />
    </Stack>
  );
}
