import { Button } from '@dental/ui';
import { Chip, Group, MultiSelect, Select, Stack, Stepper, Text } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { useForm } from '@mantine/form';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePatients } from '@/features/patients';
import { useAvailability } from '@/features/schedule/schedule.api';
import { localDateParam, slotTimeLabel } from '@/features/schedule/schedule.mappers';
import { useAuthStore } from '@/stores/auth-store.ts';
import { useBranches, useCreateAppointment, useDoctors, useServices } from '../appointments.api';
import { type WizardValues, wizardSchema } from '../appointments.schema';

type Option = { value: string; label: string };

export function NewAppointmentWizard({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { activeBranchId } = useAuthStore();
  const [active, setActive] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const { data: doctors } = useDoctors();
  const { data: patientsData } = usePatients({ page: 1, pageSize: 100 });
  const { data: servicesData } = useServices();
  const { data: branchesData } = useBranches();
  const createMut = useCreateAppointment();

  // Tenant-wide foydalanuvchi (Owner / "Barcha filiallar") uchun activeBranchId=null —
  // filialni wizard ichida tanlash kerak, aks holda branchId='' → 400 (CLI-151).
  const needsBranchSelect = activeBranchId == null;
  const branchOptions: Option[] = (branchesData ?? []).map((b) => ({ value: b.id, label: b.name }));

  const patients: Option[] = (patientsData?.items ?? []).map((p) => ({
    value: p.id,
    label: p.fullName,
  }));
  const services: Option[] = (servicesData ?? []).map((s) => ({ value: s.id, label: s.nameUz }));

  const form = useForm<WizardValues>({
    initialValues: {
      branchId: activeBranchId ?? '',
      patientId: '',
      doctorId: '',
      serviceIds: [],
      date: new Date(),
      startTime: null,
      endTime: null,
      notes: '',
    },
    validate: zod4Resolver(wizardSchema),
  });

  const doctorOptions: Option[] = (doctors ?? []).map((d) => ({ value: d.id, label: d.name }));

  // slotMinutes = Σ tanlangan xizmatlar davomiyligi (xizmat yo'q → 0 → availability o'chiq).
  const durationByService = useMemo(
    () => new Map((servicesData ?? []).map((s) => [s.id, s.durationMinutes])),
    [servicesData],
  );
  const slotMinutes = form.values.serviceIds.reduce(
    (sum, id) => sum + (durationByService.get(id) ?? 0),
    0,
  );

  const dateParam = localDateParam(form.values.date);
  const { data: availability, isLoading: slotsLoading } = useAvailability({
    doctorId: form.values.doctorId || null,
    branchId: form.values.branchId || null,
    date: dateParam,
    slotMinutes,
  });
  const slots = availability?.slots ?? [];

  // Availability bazasi (doktor/filial/sana/davomiylik) o'zgarsa — eski slot
  // tanlovini tozalaymiz, aks holda stale start/end submit'ga ketishi mumkin.
  // ⚠️ `form.setFieldValue` har renderda yangi identifikator → deps'ga qo'shib
  // bo'lmaydi (cheksiz sikl). Bazani ref'da kuzatamiz, faqat o'zgarganda tozalaymiz.
  const basis = `${form.values.doctorId}|${form.values.branchId}|${dateParam}|${slotMinutes}`;
  const prevBasis = useRef(basis);
  // biome-ignore lint/correctness/useExhaustiveDependencies: faqat baza string o'zgarsa ishlaydi
  useEffect(() => {
    if (prevBasis.current !== basis) {
      prevBasis.current = basis;
      form.setFieldValue('startTime', null);
      form.setFieldValue('endTime', null);
    }
  }, [basis]);

  const submit = () => {
    setError(null);
    if (!form.values.startTime || !form.values.endTime) return;
    createMut.mutate(
      {
        branchId: form.values.branchId,
        patientId: form.values.patientId,
        doctorId: form.values.doctorId,
        serviceIds: form.values.serviceIds,
        startTime: form.values.startTime,
        endTime: form.values.endTime,
        notes: form.values.notes,
      },
      {
        onSuccess: onClose,
        onError: () => setError(t('appointments.conflict')),
      },
    );
  };

  const next = () => setActive((s) => Math.min(s + 1, 3));
  const back = () => (active === 0 ? onClose() : setActive((s) => s - 1));

  const selectedDoctor = doctorOptions.find((d) => d.value === form.values.doctorId)?.label ?? '—';
  const selectedPatient = patients.find((p) => p.value === form.values.patientId)?.label ?? '—';
  const slotPicked = form.values.startTime != null;

  return (
    <div>
      <Stepper active={active} onStepClick={setActive}>
        <Stepper.Step label={t('appointments.step_patient')}>
          <Stack mt="md">
            {needsBranchSelect && (
              <Select
                key="branch-select"
                label={t('appointments.branch')}
                placeholder={t('appointments.branch')}
                searchable
                data={branchOptions}
                {...form.getInputProps('branchId')}
              />
            )}
            <Select
              key="patient-select"
              placeholder={t('appointments.patient')}
              searchable
              data={patients}
              {...form.getInputProps('patientId')}
            />
          </Stack>
        </Stepper.Step>
        <Stepper.Step label={t('appointments.step_service')}>
          <Stack mt="md">
            <Select
              key="doctor-select"
              label={t('appointments.doctor')}
              searchable
              data={doctorOptions}
              {...form.getInputProps('doctorId')}
            />
            <MultiSelect
              label={t('appointments.services')}
              searchable
              data={services}
              {...form.getInputProps('serviceIds')}
            />
          </Stack>
        </Stepper.Step>
        <Stepper.Step label={t('appointments.step_time')}>
          <Stack mt="md" gap="sm">
            <DatePickerInput
              label={t('appointments.date')}
              valueFormat="DD.MM.YYYY"
              value={form.values.date}
              onChange={(d) => form.setFieldValue('date', d ?? new Date())}
            />
            <Text size="sm" fw={600}>
              {t('appointments.free_slots')}
            </Text>
            {slotMinutes <= 0 ? (
              <Text size="sm" c="dimmed">
                {t('appointments.pick_service_first')}
              </Text>
            ) : slotsLoading ? (
              <Text size="sm" c="dimmed">
                {t('common.loading')}
              </Text>
            ) : slots.length === 0 ? (
              <Text size="sm" c="dimmed">
                {t('appointments.no_slots')}
              </Text>
            ) : (
              <Chip.Group
                value={form.values.startTime ?? ''}
                onChange={(val) => {
                  const slot = slots.find((s) => s.start === val);
                  form.setFieldValue('startTime', slot ? slot.start : null);
                  form.setFieldValue('endTime', slot ? slot.end : null);
                }}
              >
                <Group gap="xs">
                  {slots.map((s) => (
                    <Chip key={s.start} value={s.start}>
                      {slotTimeLabel(s.start)}
                    </Chip>
                  ))}
                </Group>
              </Chip.Group>
            )}
          </Stack>
        </Stepper.Step>
        <Stepper.Step label={t('appointments.step_confirm')}>
          <Stack mt="md" gap="xs">
            <Text size="sm">
              {t('appointments.patient')}: {selectedPatient}
            </Text>
            <Text size="sm">
              {t('appointments.doctor')}: {selectedDoctor}
            </Text>
            <Text size="sm">
              {t('appointments.services')}: {form.values.serviceIds.length}
            </Text>
            <Text size="sm">
              {t('appointments.start_time')}:{' '}
              {form.values.startTime ? slotTimeLabel(form.values.startTime) : '—'}
            </Text>
            {error != null && (
              <Text size="sm" c="red">
                {error}
              </Text>
            )}
          </Stack>
        </Stepper.Step>
      </Stepper>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
        <Button variant="default" onClick={back}>
          {active === 0 ? t('common.cancel') : t('common.back')}
        </Button>
        {active < 3 ? (
          <Button
            variant="primary"
            disabled={
              (active === 0 && needsBranchSelect && !form.values.branchId) ||
              (active === 2 && !slotPicked)
            }
            onClick={next}
          >
            {t('common.next')}
          </Button>
        ) : (
          <Button variant="primary" disabled={createMut.isPending || !slotPicked} onClick={submit}>
            {t('common.save')}
          </Button>
        )}
      </div>
    </div>
  );
}
