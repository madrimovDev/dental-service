import type { AllergyEntry } from '@dental/api-client';
import { Button, Input, Select } from '@dental/ui';
import {
  Alert,
  Badge,
  Card,
  Group,
  List,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { zodResolver } from 'mantine-form-zod-resolver';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { useAuthStore } from '@/stores/auth-store.ts';
import { useMedicalRecord, useUpdateMedicalRecord } from '../../patients.api';

const medicalSchema = z.object({
  anamnez: z.string().optional(),
  chronicConditionsText: z.string().optional(),
  currentMedicationsText: z.string().optional(),
  bloodType: z.string().optional(),
  pregnancyStatus: z.enum(['not_applicable', 'pregnant', 'planning', 'lactating']).optional(),
});

export function MedicalTab({ patientId }: { patientId: string }) {
  const { t } = useTranslation();
  const { hasPermission } = useAuthStore();
  const canView = hasPermission('medical_record.view');
  const canEdit = hasPermission('medical_record.edit');
  const [allergies, setAllergies] = useState<AllergyEntry[]>([]);

  const medicalQuery = useMedicalRecord(canView ? patientId : '');
  const updateMut = useUpdateMedicalRecord(patientId);

  const form = useForm({
    initialValues: {
      anamnez: '',
      chronicConditionsText: '',
      currentMedicationsText: '',
      bloodType: '',
      pregnancyStatus: 'not_applicable' as 'not_applicable' | 'pregnant' | 'planning' | 'lactating',
    },
    validate: zodResolver(medicalSchema),
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: form.setValues stable
  useEffect(() => {
    if (medicalQuery.data) {
      const m = medicalQuery.data;
      form.setValues({
        anamnez: m.anamnez ?? '',
        chronicConditionsText: (m.chronicConditions ?? []).join(', '),
        currentMedicationsText: (m.currentMedications ?? []).join(', '),
        bloodType: m.bloodType ?? '',
        pregnancyStatus: m.pregnancyStatus ?? 'not_applicable',
      });
      setAllergies(m.allergies ?? []);
    }
  }, [medicalQuery.data]);

  if (!canView) {
    return <Alert color="yellow">{t('patients.no_medical_permission')}</Alert>;
  }
  if (!medicalQuery.data) {
    return <Text>{t('common.loading')}</Text>;
  }

  const submit = form.onSubmit((values) =>
    updateMut.mutate({
      anamnez: values.anamnez || undefined,
      chronicConditions: values.chronicConditionsText
        ? values.chronicConditionsText
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : [],
      currentMedications: values.currentMedicationsText
        ? values.currentMedicationsText
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : [],
      allergies,
      bloodType: values.bloodType || undefined,
      pregnancyStatus: values.pregnancyStatus,
    }),
  );

  return (
    <Stack gap="md">
      <Paper withBorder p="xl" radius="md">
        <form onSubmit={submit}>
          <Stack gap="md">
            <Textarea
              label={t('medical.anamnez')}
              rows={4}
              disabled={!canEdit}
              {...form.getInputProps('anamnez')}
            />
            <Textarea
              label={t('medical.chronic_conditions')}
              description={t('medical.comma_separated')}
              rows={2}
              disabled={!canEdit}
              {...form.getInputProps('chronicConditionsText')}
            />
            <Textarea
              label={t('medical.current_medications')}
              description={t('medical.comma_separated')}
              rows={2}
              disabled={!canEdit}
              {...form.getInputProps('currentMedicationsText')}
            />

            <Card withBorder padding="md" radius="md">
              <Stack gap="sm">
                <Group justify="space-between">
                  <Text fw={600}>⚠️ {t('medical.allergies')}</Text>
                  {canEdit && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setAllergies([
                          ...allergies,
                          { type: 'anesthetic', substance: '', severity: 'mild' },
                        ])
                      }
                    >
                      {t('medical.add_allergy')}
                    </Button>
                  )}
                </Group>
                {allergies.length === 0 && <Text c="dimmed">{t('medical.no_allergies')}</Text>}
                {allergies.length > 0 && (
                  <List spacing="xs">
                    {allergies.map((a, i) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: ephemeral list state
                      <List.Item key={`allergy-${i}`}>
                        <Group gap="xs">
                          <Badge
                            color={
                              a.severity === 'severe'
                                ? 'red'
                                : a.severity === 'moderate'
                                  ? 'orange'
                                  : 'yellow'
                            }
                          >
                            {a.severity}
                          </Badge>
                          <Text fw={500}>{a.substance || '(empty)'}</Text>
                          <Text size="sm" c="dimmed">
                            ({a.type})
                          </Text>
                          {canEdit && (
                            <Button
                              size="sm"
                              variant="danger"
                              onClick={() => setAllergies(allergies.filter((_, idx) => idx !== i))}
                            >
                              {t('common.delete')}
                            </Button>
                          )}
                        </Group>
                      </List.Item>
                    ))}
                  </List>
                )}
              </Stack>
            </Card>

            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              <Input
                label={t('medical.blood_type')}
                placeholder="O+ / A- / AB+"
                value={form.values.bloodType}
                onChange={(v) => form.setFieldValue('bloodType', v)}
              />
              <Select
                label={t('medical.pregnancy_status')}
                value={form.values.pregnancyStatus}
                onChange={(v) =>
                  form.setFieldValue(
                    'pregnancyStatus',
                    (v as typeof form.values.pregnancyStatus) ?? 'not_applicable',
                  )
                }
                data={[
                  { value: 'not_applicable', label: t('medical.pregnancy.not_applicable') },
                  { value: 'pregnant', label: t('medical.pregnancy.pregnant') },
                  { value: 'planning', label: t('medical.pregnancy.planning') },
                  { value: 'lactating', label: t('medical.pregnancy.lactating') },
                ]}
              />
            </SimpleGrid>

            {canEdit && (
              <Group justify="flex-end">
                <Button type="submit" variant="primary" disabled={updateMut.isPending}>
                  {t('common.save')}
                </Button>
              </Group>
            )}
          </Stack>
        </form>
      </Paper>
    </Stack>
  );
}
