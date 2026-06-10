import { Card, Mono } from '@dental/ui';
import { Badge, Group, SimpleGrid, Stack, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
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

export function GeneralTab({ patient }: { patient: PatientDetail }) {
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
