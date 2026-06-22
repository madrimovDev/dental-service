import { Button, Card, Input, PageHead, Select } from '@dental/ui';
import { Checkbox, Group, TagsInput, Textarea } from '@mantine/core';
import { useForm } from '@mantine/form';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { PhoneInput } from '@/components/PhoneInput.tsx';
import { useCreatePatient } from '../patients.api';
import { type PatientFormValues, patientFormSchema } from '../patients.schema';
import classes from './PatientNewScreen.module.css';

export function PatientNewScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const createMut = useCreatePatient();

  const form = useForm<PatientFormValues>({
    initialValues: {
      fullName: '',
      dateOfBirth: '',
      gender: undefined,
      phone: '',
      phoneSecondary: '',
      passport: '',
      address: '',
      notes: '',
      tags: [],
      source: '',
      insurance: { provider: '', policyNumber: '' },
    },
    validate: zod4Resolver(patientFormSchema),
  });

  const submit = form.onSubmit((values) => {
    const insurance = values.insurance?.provider ? values.insurance : null;
    createMut.mutate(
      {
        fullName: values.fullName,
        dateOfBirth: values.dateOfBirth || undefined,
        gender: values.gender,
        phone: values.phone || undefined,
        phoneSecondary: values.phoneSecondary || undefined,
        passport: values.passport || undefined,
        address: values.address || undefined,
        notes: values.notes || undefined,
        tags: values.tags,
        source: values.source || undefined,
        insurance,
      },
      { onSuccess: (p) => navigate(`/patients/${p.id}`) },
    );
  });

  return (
    <form onSubmit={submit}>
      <PageHead title={t('patients.create')} />

      <Card title={t('patients.form.section_main')}>
        <div className={classes.fields}>
          <Input
            label={t('patients.form.full_name')}
            value={form.values.fullName}
            error={form.errors.fullName}
            onChange={(v) => form.setFieldValue('fullName', v)}
          />

          <div className={classes.grid2}>
            <Input
              label={t('patients.form.date_of_birth')}
              type="date"
              value={form.values.dateOfBirth ?? ''}
              error={form.errors.dateOfBirth}
              onChange={(v) => form.setFieldValue('dateOfBirth', v)}
            />
            <Select
              label={t('patients.form.gender_label')}
              placeholder={t('common.select')}
              value={form.values.gender ?? null}
              error={form.errors.gender}
              onChange={(v) =>
                form.setFieldValue('gender', (v as PatientFormValues['gender']) ?? undefined)
              }
              data={[
                { value: 'male', label: t('patients.gender.male') },
                { value: 'female', label: t('patients.gender.female') },
                { value: 'other', label: t('patients.gender.other') },
              ]}
            />
          </div>

          <div className={classes.grid2}>
            <PhoneInput label={t('patients.form.phone')} {...form.getInputProps('phone')} />
            <PhoneInput
              label={t('patients.form.phone_secondary')}
              {...form.getInputProps('phoneSecondary')}
            />
          </div>

          <Input
            label={t('patients.form.passport')}
            value={form.values.passport ?? ''}
            error={form.errors.passport}
            onChange={(v) => form.setFieldValue('passport', v)}
          />
          <Input
            label={t('patients.form.address')}
            value={form.values.address ?? ''}
            error={form.errors.address}
            onChange={(v) => form.setFieldValue('address', v)}
          />
          <Textarea label={t('patients.form.notes')} rows={3} {...form.getInputProps('notes')} />

          <TagsInput label={t('patients.form.tags')} {...form.getInputProps('tags')} />

          <Select
            label={t('patients.form.source')}
            placeholder={t('common.select')}
            value={form.values.source ?? null}
            error={form.errors.source}
            onChange={(v) => form.setFieldValue('source', v ?? '')}
            data={[
              { value: 'referral', label: t('patients.source.referral') },
              { value: 'ad', label: t('patients.source.ad') },
              { value: 'repeat', label: t('patients.source.repeat') },
              { value: 'other', label: t('patients.source.other') },
            ]}
          />

          <div className={classes.grid2}>
            <Input
              label={t('patients.form.insurance')}
              placeholder={t('patients.form.insurance_provider')}
              value={form.values.insurance?.provider ?? ''}
              error={form.errors['insurance.provider']}
              onChange={(v) => form.setFieldValue('insurance.provider', v)}
            />
            <Input
              label={t('patients.form.insurance_policy')}
              value={form.values.insurance?.policyNumber ?? ''}
              error={form.errors['insurance.policyNumber']}
              onChange={(v) => form.setFieldValue('insurance.policyNumber', v)}
            />
            <Select
              label={t('patients.form.insurance_coverage')}
              value={form.values.insurance?.coverageType ?? null}
              onChange={(v) =>
                form.setFieldValue(
                  'insurance.coverageType',
                  (v as 'dental' | 'general' | 'other') || undefined,
                )
              }
              data={[
                { value: 'dental', label: t('patients.form.coverage_dental') },
                { value: 'general', label: t('patients.form.coverage_general') },
                { value: 'other', label: t('patients.form.coverage_other') },
              ]}
            />
            <Input
              label={t('patients.form.insurance_expiry')}
              type="date"
              value={form.values.insurance?.expiryDate ?? ''}
              onChange={(v) => form.setFieldValue('insurance.expiryDate', v || undefined)}
            />
          </div>
          <Checkbox
            mt="sm"
            label={t('patients.form.insurance_active')}
            checked={form.values.insurance?.isActive ?? false}
            onChange={(e) => form.setFieldValue('insurance.isActive', e.currentTarget.checked)}
          />
        </div>
      </Card>

      <Group justify="flex-end" mt="md">
        <Button variant="ghost" onClick={() => navigate('/patients')}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" variant="primary" disabled={createMut.isPending}>
          {t('common.save')}
        </Button>
      </Group>
    </form>
  );
}
