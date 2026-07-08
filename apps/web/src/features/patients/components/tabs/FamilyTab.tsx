import { Button, Card, Input, StateView } from '@dental/ui';
import {
  ActionIcon,
  Badge,
  Checkbox,
  Group,
  Paper,
  Select,
  Stack,
  Table,
  Text,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconTrash } from '@tabler/icons-react';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/auth-store.ts';
import {
  useAddEmergencyContact,
  useAddRelative,
  usePatientEmergencyContacts,
  usePatientRelatives,
  usePatients,
  useRemoveEmergencyContact,
  useRemoveRelative,
} from '../../patients.api';
import { addEmergencyContactFormSchema, addRelativeFormSchema } from '../../patients.schema';

function AddRelativeForm({ patientId }: { patientId: string }) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const candidatesQuery = usePatients({ search, page: 1, pageSize: 20 });
  const addMut = useAddRelative(patientId);

  const form = useForm({
    initialValues: { relativePatientId: '', relationship: '' },
    validate: zod4Resolver(addRelativeFormSchema),
  });

  const options = (candidatesQuery.data?.items ?? [])
    .filter((p) => p.id !== patientId)
    .map((p) => ({ value: p.id, label: p.fullName }));

  const submit = form.onSubmit((values) =>
    addMut.mutate(
      { relativePatientId: values.relativePatientId, relationship: values.relationship },
      { onSuccess: () => form.reset() },
    ),
  );

  return (
    <Card title={t('patients.relatives.add')}>
      <form onSubmit={submit}>
        <Stack gap="md">
          <Select
            label={t('patients.relatives.search_patient')}
            placeholder={t('patients.relatives.search_placeholder')}
            searchable
            value={form.values.relativePatientId || null}
            searchValue={search}
            onSearchChange={setSearch}
            onChange={(v) => form.setFieldValue('relativePatientId', v ?? '')}
            error={form.errors.relativePatientId}
            data={options}
            nothingFoundMessage={t('patients.empty')}
          />
          <Input
            label={t('patients.relatives.relationship')}
            placeholder={t('patients.relatives.relationship_placeholder')}
            value={form.values.relationship}
            error={form.errors.relationship}
            onChange={(v) => form.setFieldValue('relationship', v)}
          />
          <Group justify="flex-end">
            <Button type="submit" variant="primary" disabled={addMut.isPending}>
              {t('patients.relatives.add')}
            </Button>
          </Group>
        </Stack>
      </form>
    </Card>
  );
}

function AddEmergencyContactForm({ patientId }: { patientId: string }) {
  const { t } = useTranslation();
  const addMut = useAddEmergencyContact(patientId);

  const form = useForm({
    initialValues: { name: '', phone: '', relationship: '', isPrimary: false },
    validate: zod4Resolver(addEmergencyContactFormSchema),
  });

  const submit = form.onSubmit((values) =>
    addMut.mutate(
      {
        name: values.name,
        phone: values.phone,
        relationship: values.relationship || undefined,
        isPrimary: values.isPrimary,
      },
      { onSuccess: () => form.reset() },
    ),
  );

  return (
    <Card title={t('patients.emergency.add')}>
      <form onSubmit={submit}>
        <Stack gap="md">
          <Input
            label={t('patients.emergency.name')}
            placeholder={t('patients.emergency.name_placeholder')}
            value={form.values.name}
            error={form.errors.name}
            onChange={(v) => form.setFieldValue('name', v)}
          />
          <Input
            label={t('patients.emergency.phone')}
            placeholder={t('patients.emergency.phone_placeholder')}
            value={form.values.phone}
            error={form.errors.phone}
            onChange={(v) => form.setFieldValue('phone', v)}
          />
          <Input
            label={t('patients.emergency.relationship')}
            placeholder={t('patients.emergency.relationship_placeholder')}
            value={form.values.relationship}
            error={form.errors.relationship}
            onChange={(v) => form.setFieldValue('relationship', v)}
          />
          <Checkbox
            label={t('patients.emergency.is_primary')}
            checked={form.values.isPrimary}
            onChange={(e) => form.setFieldValue('isPrimary', e.currentTarget.checked)}
          />
          <Group justify="flex-end">
            <Button type="submit" variant="primary" disabled={addMut.isPending}>
              {t('patients.emergency.add')}
            </Button>
          </Group>
        </Stack>
      </form>
    </Card>
  );
}

function EmergencyContactsSection({ patientId }: { patientId: string }) {
  const { t } = useTranslation();
  const { hasPermission } = useAuthStore();
  const canEdit = hasPermission('patient.edit');
  const query = usePatientEmergencyContacts(patientId);
  const removeMut = useRemoveEmergencyContact(patientId);

  const rows = query.data ?? [];

  return (
    <Stack gap="md">
      <Text fw={600}>{t('patients.emergency.title')}</Text>
      <Paper withBorder p="md" radius="var(--radius-card)">
        {query.isLoading ? (
          <StateView status="loading" skeleton="table" />
        ) : query.isError ? (
          <StateView
            status="error"
            title={t('states.error_title')}
            retryLabel={t('states.retry')}
            onRetry={() => query.refetch()}
          />
        ) : rows.length === 0 ? (
          <StateView status="empty" title={t('patients.emergency.empty')} />
        ) : (
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t('patients.emergency.name')}</Table.Th>
                <Table.Th>{t('patients.emergency.phone')}</Table.Th>
                <Table.Th>{t('patients.emergency.relationship')}</Table.Th>
                {canEdit && <Table.Th />}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((c) => (
                <Table.Tr key={c.id}>
                  <Table.Td>
                    <Group gap="xs">
                      {c.name}
                      {c.isPrimary && (
                        <Badge variant="light" color="blue">
                          {t('patients.emergency.primary')}
                        </Badge>
                      )}
                    </Group>
                  </Table.Td>
                  <Table.Td>{c.phone}</Table.Td>
                  <Table.Td>{c.relationship ?? '—'}</Table.Td>
                  {canEdit && (
                    <Table.Td>
                      <ActionIcon
                        variant="subtle"
                        color="red"
                        aria-label={t('common.delete')}
                        disabled={removeMut.isPending}
                        onClick={() => removeMut.mutate(c.id)}
                      >
                        <IconTrash size={16} />
                      </ActionIcon>
                    </Table.Td>
                  )}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Paper>
      {canEdit && <AddEmergencyContactForm patientId={patientId} />}
    </Stack>
  );
}

export function FamilyTab({ patientId }: { patientId: string }) {
  const { t } = useTranslation();
  const { hasPermission } = useAuthStore();
  const canEdit = hasPermission('patient.edit');
  const query = usePatientRelatives(patientId);
  const removeMut = useRemoveRelative(patientId);

  const rows = query.data ?? [];

  return (
    <Stack gap="md">
      <Paper withBorder p="md" radius="var(--radius-card)">
        {query.isLoading ? (
          <StateView status="loading" skeleton="table" />
        ) : query.isError ? (
          <StateView
            status="error"
            title={t('states.error_title')}
            retryLabel={t('states.retry')}
            onRetry={() => query.refetch()}
          />
        ) : rows.length === 0 ? (
          <StateView status="empty" title={t('patients.relatives.empty')} />
        ) : (
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t('patients.relatives.relative')}</Table.Th>
                <Table.Th>{t('patients.relatives.relationship')}</Table.Th>
                <Table.Th>{t('patients.relatives.direction_label')}</Table.Th>
                {canEdit && <Table.Th />}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((rel) => (
                <Table.Tr key={rel.id}>
                  <Table.Td>{rel.relativePatient.fullName}</Table.Td>
                  <Table.Td>{rel.relationship}</Table.Td>
                  <Table.Td>
                    <Badge variant="light" color={rel.direction === 'outgoing' ? 'blue' : 'gray'}>
                      {t(`patients.relatives.direction.${rel.direction}`)}
                    </Badge>
                  </Table.Td>
                  {canEdit && (
                    <Table.Td>
                      <ActionIcon
                        variant="subtle"
                        color="red"
                        aria-label={t('common.delete')}
                        disabled={removeMut.isPending}
                        onClick={() => removeMut.mutate(rel.id)}
                      >
                        <IconTrash size={16} />
                      </ActionIcon>
                    </Table.Td>
                  )}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Paper>

      {canEdit && <AddRelativeForm patientId={patientId} />}

      <EmergencyContactsSection patientId={patientId} />
    </Stack>
  );
}
