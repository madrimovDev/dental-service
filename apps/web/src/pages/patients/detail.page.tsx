import type { AllergyEntry } from '@dental/api-client';
import {
  Alert,
  Badge,
  Button,
  Card,
  Container,
  Group,
  List,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconClipboardList,
  IconDental,
  IconFlask,
  IconHeart,
  IconNotes,
  IconPhoto,
  IconPill,
  IconSignature,
  IconUser,
} from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from 'mantine-form-zod-resolver';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { z } from 'zod';
import { ConsentTab } from '@/components/clinical/ConsentTab.tsx';
import { LabOrdersTab } from '@/components/clinical/LabOrdersTab.tsx';
import { PatientImagesTab } from '@/components/clinical/PatientImagesTab.tsx';
import { PrescriptionsTab } from '@/components/clinical/PrescriptionsTab.tsx';
import { ToothChartTab } from '@/components/clinical/ToothChartTab.tsx';
import { TreatmentPlansTab } from '@/components/clinical/TreatmentPlansTab.tsx';
import { VisitNotesTab } from '@/components/clinical/VisitNotesTab.tsx';
import { PhoneInput } from '@/components/PhoneInput.tsx';
import { api } from '@/lib/api.ts';
import { useAuthStore } from '@/stores/auth-store.ts';

const profileSchema = z.object({
  fullName: z.string().min(2).max(120),
  dateOfBirth: z.string().optional(),
  gender: z.enum(['male', 'female', 'other']).optional(),
  phone: z.string().optional(),
  phoneSecondary: z.string().optional(),
  passport: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
});

const medicalSchema = z.object({
  anamnez: z.string().optional(),
  chronicConditionsText: z.string().optional(), // comma-separated input
  currentMedicationsText: z.string().optional(),
  bloodType: z.string().optional(),
  pregnancyStatus: z.enum(['not_applicable', 'pregnant', 'planning', 'lactating']).optional(),
});

export function PatientDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const { hasPermission } = useAuthStore();
  const qc = useQueryClient();
  const [allergies, setAllergies] = useState<AllergyEntry[]>([]);

  const patientQuery = useQuery({
    queryKey: ['patient', id],
    queryFn: () => api.patients.get(id ?? ''),
    enabled: !!id,
  });

  const medicalQuery = useQuery({
    queryKey: ['patient', id, 'medical'],
    queryFn: () => api.patients.getMedical(id ?? ''),
    enabled: !!id && hasPermission('medical_record.view'),
  });

  const profileForm = useForm({
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
    validate: zodResolver(profileSchema),
  });

  const medicalForm = useForm({
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
    if (patientQuery.data) {
      const p = patientQuery.data;
      profileForm.setValues({
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
  }, [patientQuery.data]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: form.setValues stable
  useEffect(() => {
    if (medicalQuery.data) {
      const m = medicalQuery.data;
      medicalForm.setValues({
        anamnez: m.anamnez ?? '',
        chronicConditionsText: (m.chronicConditions ?? []).join(', '),
        currentMedicationsText: (m.currentMedications ?? []).join(', '),
        bloodType: m.bloodType ?? '',
        pregnancyStatus: m.pregnancyStatus ?? 'not_applicable',
      });
      setAllergies(m.allergies ?? []);
    }
  }, [medicalQuery.data]);

  const updateProfileMut = useMutation({
    mutationFn: (values: typeof profileForm.values) =>
      api.patients.update(id ?? '', {
        ...values,
        phone: values.phone || null,
        phoneSecondary: values.phoneSecondary || null,
        passport: values.passport || null,
        address: values.address || null,
        notes: values.notes || null,
        dateOfBirth: values.dateOfBirth || null,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['patient', id] }),
  });

  const updateMedicalMut = useMutation({
    mutationFn: (values: typeof medicalForm.values) =>
      api.patients.updateMedical(id ?? '', {
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ['patient', id, 'medical'] }),
  });

  if (patientQuery.isLoading) return <Text>{t('common.loading')}</Text>;
  if (!patientQuery.data) return <Text>{t('patients.not_found')}</Text>;

  const patient = patientQuery.data;
  const severeAllergy = allergies.find((a) => a.severity === 'severe' && a.type === 'anesthetic');

  return (
    <Container size="lg">
      <Stack gap="lg">
        <Group>
          <Button
            component={Link}
            to="/patients"
            variant="subtle"
            leftSection={<IconArrowLeft size={16} />}
          >
            {t('common.back')}
          </Button>
          <Title order={2}>{patient.fullName}</Title>
          {patient.archivedAt && <Badge color="gray">{t('patients.archived')}</Badge>}
        </Group>

        {severeAllergy && (
          <Alert color="red" icon={<IconAlertTriangle size={20} />} variant="filled">
            <Text fw={700}>⚠️ {t('patients.severe_allergy_warning')}</Text>
            <Text size="sm">
              {severeAllergy.substance} ({severeAllergy.severity})
              {severeAllergy.notes && ` — ${severeAllergy.notes}`}
            </Text>
          </Alert>
        )}

        <Tabs defaultValue="profile">
          <Tabs.List>
            <Tabs.Tab value="profile" leftSection={<IconUser size={16} />}>
              {t('patients.tab_profile')}
            </Tabs.Tab>
            <Tabs.Tab value="medical" leftSection={<IconHeart size={16} />}>
              {t('patients.tab_medical')}
            </Tabs.Tab>
            {hasPermission('medical_record.view') && (
              <>
                <Tabs.Tab value="plans" leftSection={<IconClipboardList size={16} />}>
                  {t('patients.tab_treatment_plans')}
                </Tabs.Tab>
                <Tabs.Tab value="visits" leftSection={<IconNotes size={16} />}>
                  {t('patients.tab_visit_notes')}
                </Tabs.Tab>
                <Tabs.Tab value="chart" leftSection={<IconDental size={16} />}>
                  {t('patients.tab_tooth_chart')}
                </Tabs.Tab>
              </>
            )}
            {hasPermission('prescription.view') && (
              <Tabs.Tab value="prescriptions" leftSection={<IconPill size={16} />}>
                {t('patients.tab_prescriptions')}
              </Tabs.Tab>
            )}
            {hasPermission('consent.view') && (
              <Tabs.Tab value="consent" leftSection={<IconSignature size={16} />}>
                {t('patients.tab_consent')}
              </Tabs.Tab>
            )}
            {hasPermission('lab_order.view') && (
              <Tabs.Tab value="lab" leftSection={<IconFlask size={16} />}>
                {t('patients.tab_lab_orders')}
              </Tabs.Tab>
            )}
            {hasPermission('patient_image.view') && (
              <Tabs.Tab value="images" leftSection={<IconPhoto size={16} />}>
                {t('patients.tab_images')}
              </Tabs.Tab>
            )}
          </Tabs.List>

          <Tabs.Panel value="profile" pt="lg">
            <Paper withBorder p="xl" radius="md">
              <form onSubmit={profileForm.onSubmit((v) => updateProfileMut.mutate(v))}>
                <Stack gap="md">
                  <TextInput
                    label={t('patients.full_name')}
                    disabled={!hasPermission('patient.edit')}
                    {...profileForm.getInputProps('fullName')}
                  />
                  <SimpleGrid cols={{ base: 1, sm: 2 }}>
                    <TextInput
                      label={t('patients.dob')}
                      type="date"
                      disabled={!hasPermission('patient.edit')}
                      {...profileForm.getInputProps('dateOfBirth')}
                    />
                    <Select
                      label={t('patients.gender')}
                      data={[
                        { value: 'male', label: t('patients.gender_male') },
                        { value: 'female', label: t('patients.gender_female') },
                        { value: 'other', label: t('patients.gender_other') },
                      ]}
                      clearable
                      disabled={!hasPermission('patient.edit')}
                      {...profileForm.getInputProps('gender')}
                    />
                  </SimpleGrid>
                  <SimpleGrid cols={{ base: 1, sm: 2 }}>
                    <PhoneInput
                      label={t('patients.phone')}
                      disabled={!hasPermission('patient.edit')}
                      {...profileForm.getInputProps('phone')}
                    />
                    <PhoneInput
                      label={t('patients.phone_secondary')}
                      disabled={!hasPermission('patient.edit')}
                      {...profileForm.getInputProps('phoneSecondary')}
                    />
                  </SimpleGrid>
                  <TextInput
                    label={t('patients.passport')}
                    disabled={!hasPermission('patient.edit')}
                    {...profileForm.getInputProps('passport')}
                  />
                  <TextInput
                    label={t('patients.address')}
                    disabled={!hasPermission('patient.edit')}
                    {...profileForm.getInputProps('address')}
                  />
                  <Textarea
                    label={t('patients.notes')}
                    rows={3}
                    disabled={!hasPermission('patient.edit')}
                    {...profileForm.getInputProps('notes')}
                  />
                  {hasPermission('patient.edit') && (
                    <Group justify="flex-end">
                      <Button type="submit" loading={updateProfileMut.isPending}>
                        {t('common.save')}
                      </Button>
                    </Group>
                  )}
                </Stack>
              </form>
            </Paper>
          </Tabs.Panel>

          <Tabs.Panel value="medical" pt="lg">
            {!hasPermission('medical_record.view') ? (
              <Alert color="yellow">{t('patients.no_medical_permission')}</Alert>
            ) : !medicalQuery.data ? (
              <Text>{t('common.loading')}</Text>
            ) : (
              <Paper withBorder p="xl" radius="md">
                <form onSubmit={medicalForm.onSubmit((v) => updateMedicalMut.mutate(v))}>
                  <Stack gap="md">
                    <Textarea
                      label={t('medical.anamnez')}
                      rows={4}
                      disabled={!hasPermission('medical_record.edit')}
                      {...medicalForm.getInputProps('anamnez')}
                    />
                    <Textarea
                      label={t('medical.chronic_conditions')}
                      description={t('medical.comma_separated')}
                      rows={2}
                      disabled={!hasPermission('medical_record.edit')}
                      {...medicalForm.getInputProps('chronicConditionsText')}
                    />
                    <Textarea
                      label={t('medical.current_medications')}
                      description={t('medical.comma_separated')}
                      rows={2}
                      disabled={!hasPermission('medical_record.edit')}
                      {...medicalForm.getInputProps('currentMedicationsText')}
                    />

                    <Card withBorder padding="md" radius="md">
                      <Stack gap="sm">
                        <Group justify="space-between">
                          <Text fw={600}>⚠️ {t('medical.allergies')}</Text>
                          {hasPermission('medical_record.edit') && (
                            <Button
                              size="xs"
                              variant="light"
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
                        {allergies.length === 0 && (
                          <Text c="dimmed">{t('medical.no_allergies')}</Text>
                        )}
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
                                  {hasPermission('medical_record.edit') && (
                                    <Button
                                      size="xs"
                                      variant="subtle"
                                      color="red"
                                      onClick={() =>
                                        setAllergies(allergies.filter((_, idx) => idx !== i))
                                      }
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
                      <TextInput
                        label={t('medical.blood_type')}
                        placeholder="O+ / A- / AB+"
                        disabled={!hasPermission('medical_record.edit')}
                        {...medicalForm.getInputProps('bloodType')}
                      />
                      <Select
                        label={t('medical.pregnancy_status')}
                        data={[
                          { value: 'not_applicable', label: t('medical.pregnancy.not_applicable') },
                          { value: 'pregnant', label: t('medical.pregnancy.pregnant') },
                          { value: 'planning', label: t('medical.pregnancy.planning') },
                          { value: 'lactating', label: t('medical.pregnancy.lactating') },
                        ]}
                        disabled={!hasPermission('medical_record.edit')}
                        {...medicalForm.getInputProps('pregnancyStatus')}
                      />
                    </SimpleGrid>

                    {hasPermission('medical_record.edit') && (
                      <Group justify="flex-end">
                        <Button type="submit" loading={updateMedicalMut.isPending}>
                          {t('common.save')}
                        </Button>
                      </Group>
                    )}
                  </Stack>
                </form>
              </Paper>
            )}
          </Tabs.Panel>

          {hasPermission('medical_record.view') && (
            <>
              <Tabs.Panel value="plans" pt="lg">
                <TreatmentPlansTab patientId={id ?? ''} />
              </Tabs.Panel>
              <Tabs.Panel value="visits" pt="lg">
                <VisitNotesTab patientId={id ?? ''} />
              </Tabs.Panel>
              <Tabs.Panel value="chart" pt="lg">
                <ToothChartTab patientId={id ?? ''} />
              </Tabs.Panel>
            </>
          )}
          {hasPermission('prescription.view') && (
            <Tabs.Panel value="prescriptions" pt="lg">
              <PrescriptionsTab patientId={id ?? ''} />
            </Tabs.Panel>
          )}
          {hasPermission('consent.view') && (
            <Tabs.Panel value="consent" pt="lg">
              <ConsentTab patientId={id ?? ''} />
            </Tabs.Panel>
          )}
          {hasPermission('lab_order.view') && (
            <Tabs.Panel value="lab" pt="lg">
              <LabOrdersTab patientId={id ?? ''} />
            </Tabs.Panel>
          )}
          {hasPermission('patient_image.view') && (
            <Tabs.Panel value="images" pt="lg">
              <PatientImagesTab patientId={id ?? ''} />
            </Tabs.Panel>
          )}
        </Tabs>
      </Stack>
    </Container>
  );
}
