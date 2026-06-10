import { Button } from '@dental/ui';
import { MultiSelect, Select, Stack, Stepper, Text } from '@mantine/core';
import { DateTimePicker } from '@mantine/dates';
import { useForm } from '@mantine/form';
import { zodResolver } from 'mantine-form-zod-resolver';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api.ts';
import { useAuthStore } from '@/stores/auth-store.ts';
import { useCreateAppointment, useDoctors } from '../appointments.api';
import { type WizardValues, wizardSchema } from '../appointments.schema';

type Option = { value: string; label: string };

export function NewAppointmentWizard({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { activeBranchId } = useAuthStore();
  const [active, setActive] = useState(0);
  const [patients, setPatients] = useState<Option[]>([]);
  const [services, setServices] = useState<Option[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { data: doctors } = useDoctors();
  const createMut = useCreateAppointment();

  const form = useForm<WizardValues>({
    initialValues: {
      branchId: activeBranchId ?? '',
      patientId: '',
      doctorId: '',
      serviceIds: [],
      startTime: new Date(),
      endTime: new Date(Date.now() + 30 * 60000),
      notes: '',
    },
    validate: zodResolver(wizardSchema),
  });

  useEffect(() => {
    let cancelled = false;
    void api.patients.list({ pageSize: 100 }).then((res) => {
      if (!cancelled) {
        setPatients(res.data.map((p) => ({ value: p.id, label: p.fullName })));
      }
    });
    void api.services.list().then((res) => {
      if (!cancelled) {
        setServices(res.map((s) => ({ value: s.id, label: s.nameUz })));
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const doctorOptions: Option[] = (doctors ?? []).map((d) => ({ value: d.id, label: d.name }));

  const submit = () => {
    setError(null);
    createMut.mutate(
      {
        branchId: form.values.branchId,
        patientId: form.values.patientId,
        doctorId: form.values.doctorId,
        serviceIds: form.values.serviceIds,
        startTime: form.values.startTime.toISOString(),
        endTime: form.values.endTime.toISOString(),
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

  return (
    <div>
      <Stepper active={active} onStepClick={setActive}>
        <Stepper.Step label={t('appointments.step_patient')}>
          <Stack mt="md">
            <Select
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
          <Stack mt="md">
            <DateTimePicker
              label={t('appointments.start_time')}
              {...form.getInputProps('startTime')}
            />
            <DateTimePicker label={t('appointments.end_time')} {...form.getInputProps('endTime')} />
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
          <Button variant="primary" onClick={next}>
            {t('common.next')}
          </Button>
        ) : (
          <Button variant="primary" disabled={createMut.isPending} onClick={submit}>
            {t('common.save')}
          </Button>
        )}
      </div>
    </div>
  );
}
