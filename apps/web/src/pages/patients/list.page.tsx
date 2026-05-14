import {
  ActionIcon,
  Badge,
  Button,
  Container,
  Group,
  Pagination,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { IconEye, IconPlus, IconSearch, IconTrash } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api.ts';
import { useAuthStore } from '@/stores/auth-store.ts';

export function PatientsListPage() {
  const { t } = useTranslation();
  const { hasPermission } = useAuthStore();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [archived, setArchived] = useState(false);
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: ['patients', { search, archived, page }],
    queryFn: () => api.patients.list({ search: search || undefined, archived, page, pageSize: 20 }),
  });

  const archiveMut = useMutation({
    mutationFn: api.patients.archive,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['patients'] }),
  });

  return (
    <Container size="xl">
      <Stack gap="lg">
        <Group justify="space-between">
          <Title order={2}>{t('patients.title')}</Title>
          {hasPermission('patient.create') && (
            <Button leftSection={<IconPlus size={18} />} component={Link} to="/patients/new">
              {t('patients.create')}
            </Button>
          )}
        </Group>

        <Group>
          <TextInput
            placeholder={t('patients.search_placeholder')}
            leftSection={<IconSearch size={16} />}
            value={search}
            onChange={(e) => {
              setSearch(e.currentTarget.value);
              setPage(1);
            }}
            style={{ flex: 1 }}
          />
          <Switch
            label={t('patients.show_archived')}
            checked={archived}
            onChange={(e) => {
              setArchived(e.currentTarget.checked);
              setPage(1);
            }}
          />
        </Group>

        {query.isLoading && <Text>{t('common.loading')}</Text>}
        {query.data && query.data.data.length === 0 && (
          <Text c="dimmed">{t('patients.empty')}</Text>
        )}
        {query.data && query.data.data.length > 0 && (
          <>
            <Table verticalSpacing="md">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t('patients.full_name')}</Table.Th>
                  <Table.Th>{t('patients.phone')}</Table.Th>
                  <Table.Th>{t('patients.dob')}</Table.Th>
                  <Table.Th>{t('patients.gender')}</Table.Th>
                  <Table.Th>{t('patients.status')}</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {query.data.data.map((p) => (
                  <Table.Tr key={p.id}>
                    <Table.Td>
                      <Text fw={500}>{p.fullName}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Text ff="monospace" size="sm">
                        {p.phone ?? '—'}
                      </Text>
                    </Table.Td>
                    <Table.Td>{p.dateOfBirth ?? '—'}</Table.Td>
                    <Table.Td>{p.gender ? t(`patients.gender_${p.gender}`) : '—'}</Table.Td>
                    <Table.Td>
                      {p.archivedAt ? (
                        <Badge color="gray">{t('patients.archived')}</Badge>
                      ) : (
                        <Badge color="teal">{t('patients.active')}</Badge>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Group gap="xs" justify="flex-end">
                        <ActionIcon component={Link} to={`/patients/${p.id}`} variant="subtle">
                          <IconEye size={16} />
                        </ActionIcon>
                        {hasPermission('patient.delete') && !p.archivedAt && (
                          <ActionIcon
                            variant="subtle"
                            color="red"
                            onClick={() => {
                              if (confirm(t('patients.confirm_archive'))) {
                                archiveMut.mutate(p.id);
                              }
                            }}
                          >
                            <IconTrash size={16} />
                          </ActionIcon>
                        )}
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
            <Group justify="center">
              <Pagination
                value={page}
                onChange={setPage}
                total={Math.ceil((query.data.meta.total ?? 0) / 20)}
              />
            </Group>
          </>
        )}
      </Stack>
    </Container>
  );
}
