import type { Branch } from '@dental/api-client';
import {
  ActionIcon,
  Button,
  Container,
  Group,
  Modal,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useDisclosure } from '@mantine/hooks';
import { IconEdit, IconPlus, IconTrash } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from 'mantine-form-zod-resolver';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { api } from '@/lib/api.ts';
import { useAuthStore } from '@/stores/auth-store.ts';

const schema = z.object({
  name: z.string().min(2).max(120),
  address: z.string().max(500).optional(),
  phone: z
    .string()
    .regex(/^\+?\d{9,15}$/)
    .optional()
    .or(z.literal('')),
});

type FormValues = z.infer<typeof schema>;

export function BranchesPage() {
  const { t } = useTranslation();
  const { hasPermission } = useAuthStore();
  const qc = useQueryClient();
  const [opened, { open, close }] = useDisclosure(false);
  const [editing, setEditing] = useState<Branch | null>(null);

  const branchesQuery = useQuery({
    queryKey: ['branches'],
    queryFn: api.branches.list,
  });

  const form = useForm<FormValues>({
    initialValues: { name: '', address: '', phone: '' },
    validate: zodResolver(schema),
  });

  const upsertMut = useMutation({
    mutationFn: async (values: FormValues) => {
      const payload = {
        name: values.name,
        address: values.address || undefined,
        phone: values.phone || undefined,
      };
      return editing
        ? await api.branches.update(editing.id, payload)
        : await api.branches.create(payload);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['branches'] });
      close();
      setEditing(null);
      form.reset();
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.branches.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['branches'] }),
  });

  const openCreate = () => {
    setEditing(null);
    form.reset();
    open();
  };

  const openEdit = (b: Branch) => {
    setEditing(b);
    form.setValues({ name: b.name, address: b.address ?? '', phone: b.phone ?? '' });
    open();
  };

  return (
    <Container size="lg">
      <Stack gap="lg">
        <Group justify="space-between">
          <Title order={2}>{t('branches.title')}</Title>
          {hasPermission('branch.create') && (
            <Button leftSection={<IconPlus size={18} />} onClick={openCreate}>
              {t('branches.create')}
            </Button>
          )}
        </Group>

        {branchesQuery.isLoading && <Text>{t('common.loading')}</Text>}
        {branchesQuery.data && branchesQuery.data.length === 0 && (
          <Text c="dimmed">{t('branches.empty')}</Text>
        )}
        {branchesQuery.data && branchesQuery.data.length > 0 && (
          <Table verticalSpacing="md">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t('common.name')}</Table.Th>
                <Table.Th>{t('branches.address')}</Table.Th>
                <Table.Th>{t('branches.phone')}</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {branchesQuery.data.map((b) => (
                <Table.Tr key={b.id}>
                  <Table.Td>{b.name}</Table.Td>
                  <Table.Td>{b.address ?? '—'}</Table.Td>
                  <Table.Td>{b.phone ?? '—'}</Table.Td>
                  <Table.Td>
                    <Group gap="xs" justify="flex-end">
                      {hasPermission('branch.edit') && (
                        <ActionIcon variant="subtle" onClick={() => openEdit(b)}>
                          <IconEdit size={16} />
                        </ActionIcon>
                      )}
                      {hasPermission('branch.delete') && (
                        <ActionIcon
                          variant="subtle"
                          color="red"
                          onClick={() => {
                            if (confirm(t('branches.confirm_delete'))) {
                              deleteMut.mutate(b.id);
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
        )}
      </Stack>

      <Modal
        opened={opened}
        onClose={close}
        title={editing ? t('branches.edit') : t('branches.create')}
      >
        <form onSubmit={form.onSubmit((values) => upsertMut.mutate(values))}>
          <Stack gap="md">
            <TextInput label={t('branches.name')} required {...form.getInputProps('name')} />
            <TextInput label={t('branches.address')} {...form.getInputProps('address')} />
            <TextInput
              label={t('branches.phone')}
              placeholder="+998..."
              {...form.getInputProps('phone')}
            />
            <Group justify="flex-end">
              <Button variant="default" onClick={close}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" loading={upsertMut.isPending}>
                {t('common.save')}
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Container>
  );
}
