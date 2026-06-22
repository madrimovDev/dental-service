import type { Branch } from '@dental/api-client';
import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Modal,
  Stack,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useDisclosure } from '@mantine/hooks';
import { IconEdit, IconPlus, IconTrash } from '@tabler/icons-react';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PhoneInput } from '@/components/PhoneInput.tsx';
import { useAuthStore } from '@/stores/auth-store.ts';
import { useBranches, useDeleteBranch, useUpsertBranch, useUsers } from '../settings.api';
import { type BranchFormValues, branchSchema } from '../settings.schema';
import { ConfirmModal } from './ConfirmModal';
import { SettingsShell } from './SettingsShell';

export function BranchesSettingsScreen() {
  const { t } = useTranslation();
  const { hasPermission } = useAuthStore();
  const branches = useBranches();
  const assignments = useUsers();
  const upsert = useUpsertBranch();
  const remove = useDeleteBranch();

  // Filial bo'yicha aktiv xodim soni (CLI-159) — assignment'lardan client-side hisoblanadi.
  // branchId=null ("barcha filiallar") biriktirilgan xodimlar har filialga tegishli sanaladi.
  const { perBranch, allBranchesCount } = useMemo(() => {
    const counts = new Map<string, number>();
    let allCount = 0;
    for (const a of assignments.data ?? []) {
      if (!a.isActive) continue;
      if (a.branchId) counts.set(a.branchId, (counts.get(a.branchId) ?? 0) + 1);
      else allCount += 1;
    }
    return { perBranch: counts, allBranchesCount: allCount };
  }, [assignments.data]);
  const [opened, { open, close }] = useDisclosure(false);
  const [editing, setEditing] = useState<Branch | null>(null);
  const [toDelete, setToDelete] = useState<Branch | null>(null);

  const form = useForm<BranchFormValues>({
    initialValues: { name: '', address: '', phone: '' },
    validate: zod4Resolver(branchSchema),
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

  const submit = (values: BranchFormValues) =>
    upsert.mutate(
      {
        id: editing?.id ?? null,
        name: values.name,
        address: values.address || undefined,
        phone: values.phone || undefined,
      },
      {
        onSuccess: () => {
          close();
          setEditing(null);
          form.reset();
        },
      },
    );

  const actions = hasPermission('branch.create') ? (
    <Button leftSection={<IconPlus size={18} />} onClick={openCreate}>
      {t('branches.create')}
    </Button>
  ) : undefined;

  return (
    <SettingsShell active="branches" actions={actions}>
      <Stack gap="lg">
        {branches.isLoading && <Text>{t('common.loading')}</Text>}
        {branches.data && branches.data.length === 0 && (
          <Text c="dimmed">{t('branches.empty')}</Text>
        )}
        {branches.data && branches.data.length > 0 && (
          <Table verticalSpacing="md">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t('common.name')}</Table.Th>
                <Table.Th>{t('branches.address')}</Table.Th>
                <Table.Th>{t('branches.phone')}</Table.Th>
                <Table.Th>{t('branches.staff_count')}</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {branches.data.map((b) => {
                const count = (perBranch.get(b.id) ?? 0) + allBranchesCount;
                return (
                  <Table.Tr key={b.id}>
                    <Table.Td>{b.name}</Table.Td>
                    <Table.Td>{b.address ?? '—'}</Table.Td>
                    <Table.Td>{b.phone ?? '—'}</Table.Td>
                    <Table.Td>
                      <Badge variant="light" color="gray">
                        {t('branches.staff_n', { n: count })}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Group gap="xs" justify="flex-end">
                        {hasPermission('branch.edit') && (
                          <ActionIcon
                            variant="subtle"
                            onClick={() => openEdit(b)}
                            aria-label={t('common.edit')}
                          >
                            <IconEdit size={16} />
                          </ActionIcon>
                        )}
                        {hasPermission('branch.delete') && (
                          <ActionIcon
                            variant="subtle"
                            color="red"
                            onClick={() => setToDelete(b)}
                            aria-label={t('common.delete')}
                          >
                            <IconTrash size={16} />
                          </ActionIcon>
                        )}
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        )}
      </Stack>

      <Modal
        opened={opened}
        onClose={close}
        title={editing ? t('branches.edit') : t('branches.create')}
      >
        <form onSubmit={form.onSubmit(submit)}>
          <Stack gap="md">
            <TextInput label={t('branches.name')} required {...form.getInputProps('name')} />
            <TextInput label={t('branches.address')} {...form.getInputProps('address')} />
            <PhoneInput label={t('branches.phone')} {...form.getInputProps('phone')} />
            <Group justify="flex-end">
              <Button variant="default" onClick={close}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" loading={upsert.isPending}>
                {t('common.save')}
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      <ConfirmModal
        opened={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={() => {
          if (toDelete) remove.mutate(toDelete.id, { onSuccess: () => setToDelete(null) });
        }}
        message={t('branches.confirm_delete')}
        loading={remove.isPending}
      />
    </SettingsShell>
  );
}
