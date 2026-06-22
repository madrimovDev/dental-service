import type { AllergyEntry, MedicalRecordHistoryEntry } from '@dental/api-client';
import { Button, Input, Select } from '@dental/ui';
import {
  Accordion,
  Alert,
  Card,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/auth-store.ts';
import {
  useMedicalRecord,
  useMedicalRecordHistory,
  useUpdateMedicalRecord,
} from '../../patients.api';
import { medicalRecordFormSchema } from '../../patients.schema';

function fmtValue(v: unknown): string {
  if (v == null) return '—';
  if (Array.isArray(v)) return v.length ? v.map((x) => fmtValue(x)).join(', ') : '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function MedicalHistorySection({ patientId }: { patientId: string }) {
  const { t, i18n } = useTranslation();
  const historyQuery = useMedicalRecordHistory(patientId);
  const entries: MedicalRecordHistoryEntry[] = historyQuery.data ?? [];

  if (entries.length === 0) return null;

  return (
    <Paper withBorder p="md" radius="md">
      <Text fw={600} mb="sm">
        {t('medical.history_title')}
      </Text>
      <Accordion variant="separated">
        {entries.map((e) => (
          <Accordion.Item key={e.id} value={e.id}>
            <Accordion.Control>
              <Group justify="space-between" wrap="nowrap">
                <Text size="sm">
                  {new Date(e.changedAt).toLocaleString(i18n.language === 'ru' ? 'ru-RU' : 'uz-UZ')}
                </Text>
                <Text size="sm" c="dimmed">
                  {e.changedBy?.fullName ?? '—'} · {e.changes.length} {t('medical.history_fields')}
                </Text>
              </Group>
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap={4}>
                {e.changes.map((ch) => (
                  <Text key={ch.field} size="sm">
                    <b>{String(t(`medical.${ch.field}`, { defaultValue: ch.field }))}:</b>{' '}
                    {fmtValue(ch.before)} → {fmtValue(ch.after)}
                  </Text>
                ))}
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>
        ))}
      </Accordion>
    </Paper>
  );
}

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
    validate: zod4Resolver(medicalRecordFormSchema),
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

  const updateAllergy = (index: number, patch: Partial<AllergyEntry>) =>
    setAllergies((prev) => prev.map((a, idx) => (idx === index ? { ...a, ...patch } : a)));

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
                {allergies.map((a, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: ephemeral list state
                  <Group key={`allergy-${i}`} gap="xs" align="flex-end" wrap="nowrap">
                    <Input
                      label={i === 0 ? t('medical.allergy_substance') : undefined}
                      placeholder={t('medical.allergy_substance')}
                      value={a.substance}
                      onChange={(v) => updateAllergy(i, { substance: v })}
                    />
                    <Select
                      label={i === 0 ? t('medical.allergy_severity') : undefined}
                      value={a.severity}
                      onChange={(v) =>
                        v && updateAllergy(i, { severity: v as AllergyEntry['severity'] })
                      }
                      data={[
                        { value: 'mild', label: t('medical.severity.mild') },
                        { value: 'moderate', label: t('medical.severity.moderate') },
                        { value: 'severe', label: t('medical.severity.severe') },
                      ]}
                    />
                    <Select
                      label={i === 0 ? t('medical.allergy_type') : undefined}
                      value={a.type}
                      onChange={(v) => v && updateAllergy(i, { type: v as AllergyEntry['type'] })}
                      data={[
                        { value: 'anesthetic', label: t('medical.allergy_type_opt.anesthetic') },
                        { value: 'medication', label: t('medical.allergy_type_opt.medication') },
                        { value: 'material', label: t('medical.allergy_type_opt.material') },
                        { value: 'food', label: t('medical.allergy_type_opt.food') },
                        { value: 'other', label: t('medical.allergy_type_opt.other') },
                      ]}
                    />
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
                ))}
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

      <MedicalHistorySection patientId={patientId} />
    </Stack>
  );
}
