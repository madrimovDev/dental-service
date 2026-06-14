import { Button, Card, Input } from '@dental/ui';
import { ActionIcon, Badge, Group, Paper, Select, Stack, Table, Text } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconTrash } from '@tabler/icons-react';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/auth-store.ts';
import {
  useAddRelative,
  usePatientRelatives,
  usePatients,
  useRemoveRelative,
} from '../../patients.api';
import { addRelativeFormSchema } from '../../patients.schema';

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

export function FamilyTab({ patientId }: { patientId: string }) {
  const { t } = useTranslation();
  const { hasPermission } = useAuthStore();
  const canEdit = hasPermission('patient.edit');
  const query = usePatientRelatives(patientId);
  const removeMut = useRemoveRelative(patientId);

  const rows = query.data ?? [];

  return (
    <Stack gap="md">
      <Paper withBorder p="md" radius="md">
        {query.isLoading ? (
          <Text>{t('common.loading')}</Text>
        ) : rows.length === 0 ? (
          <Text c="dimmed">{t('patients.relatives.empty')}</Text>
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
    </Stack>
  );
}
