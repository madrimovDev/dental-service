import { Button, Group, Modal, Select, Stack, Tabs, Text } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCheckInCandidates, useCreateTicket, usePatientsAll, useServices } from '../queue.api';

export function CheckInDialog({
  opened,
  onClose,
  branchId,
}: {
  opened: boolean;
  onClose: () => void;
  branchId: string;
}) {
  const { t } = useTranslation();
  const candidates = useCheckInCandidates(branchId);
  // Yozuvdan check-in tab'idagi bemor-nomi qidiruvi ("Bemor" ustuni) qidiruvdan
  // mustaqil — cheklanmagan (search='') chaqiruv shu uchun saqlanadi.
  const patients = usePatientsAll();
  const services = useServices();
  const createTicket = useCreateTicket();

  const [walkInPatient, setWalkInPatient] = useState<string | null>(null);
  const [walkInService, setWalkInService] = useState<string | null>(null);
  // CLI-454: walk-in bemor Select avval pageSize:100 bilan qidiruvsiz cheklangan edi —
  // 100 tadan ortiq bemorli tenant'da kerakli bemor ko'rinmasdi. Endi qidiruv matni
  // debounced holda serverga uzatiladi (backend `ilike` filtri); "yozuvdan" tab'idagi
  // nom lookup'iga ta'sir qilmaydi (yuqoridagi `patients`, alohida chaqiruv).
  const [walkInPatientSearch, setWalkInPatientSearch] = useState('');
  const [debouncedWalkInPatientSearch] = useDebouncedValue(walkInPatientSearch, 300);
  const walkInPatients = usePatientsAll(debouncedWalkInPatientSearch);

  function hhmm(iso: string) {
    return new Date(iso).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
  }

  const handleClose = () => {
    setWalkInPatient(null);
    setWalkInService(null);
    setWalkInPatientSearch('');
    onClose();
  };

  const checkIn = (appointmentId: string, patientId: string, serviceId?: string) => {
    createTicket.mutate(
      { branchId, appointmentId, patientId, serviceId },
      { onSuccess: handleClose },
    );
  };

  const walkIn = () => {
    createTicket.mutate(
      {
        branchId,
        patientId: walkInPatient ?? undefined,
        serviceId: walkInService ?? undefined,
      },
      { onSuccess: handleClose },
    );
  };

  const patientName = (id: string) => patients.data?.data.find((p) => p.id === id)?.fullName ?? '—';

  return (
    <Modal opened={opened} onClose={handleClose} title={t('queue.new_ticket')}>
      <Tabs defaultValue="from_appointment">
        <Tabs.List mb="md">
          <Tabs.Tab value="from_appointment">{t('queue.from_appointment')}</Tabs.Tab>
          <Tabs.Tab value="walk_in">{t('queue.walk_in')}</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="from_appointment">
          <Stack gap="sm">
            {(candidates.data ?? []).length === 0 && (
              <Text c="dimmed" size="sm">
                {t('queue.no_candidates')}
              </Text>
            )}
            {(candidates.data ?? []).map((a) => (
              <Group key={a.id} justify="space-between">
                <Stack gap={0}>
                  <Text size="sm">{patientName(a.patientId)}</Text>
                  <Text size="xs" c="dimmed">
                    {hhmm(a.startTime)}
                  </Text>
                </Stack>
                <Button
                  size="xs"
                  onClick={() => checkIn(a.id, a.patientId, a.serviceIds?.[0])}
                  loading={createTicket.isPending}
                >
                  {t('queue.check_in')}
                </Button>
              </Group>
            ))}
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="walk_in">
          <Stack gap="md">
            <Select
              label={t('queue.patient')}
              data={
                walkInPatients.data?.data.map((p) => ({ value: p.id, label: p.fullName })) ?? []
              }
              searchable
              clearable
              value={walkInPatient}
              onChange={setWalkInPatient}
              searchValue={walkInPatientSearch}
              onSearchChange={setWalkInPatientSearch}
            />
            <Select
              label={t('queue.service')}
              data={
                services.data
                  ?.filter((s) => s.isActive)
                  .map((s) => ({ value: s.id, label: s.nameUz })) ?? []
              }
              searchable
              clearable
              value={walkInService}
              onChange={setWalkInService}
            />
            <Group justify="flex-end">
              <Button variant="default" onClick={handleClose}>
                {t('common.cancel')}
              </Button>
              <Button onClick={walkIn} loading={createTicket.isPending}>
                {t('queue.add')}
              </Button>
            </Group>
          </Stack>
        </Tabs.Panel>
      </Tabs>
    </Modal>
  );
}
