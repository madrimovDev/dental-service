import type { Role } from '@dental/api-client';
import { StatusPill } from '@dental/ui';
import { ActionIcon, Button, Group, Stack, Table, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconEdit, IconPlus, IconShieldCheck, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/auth-store.ts';
import { useDeleteRole, useRoles } from '../settings.api';
import { ConfirmModal } from './ConfirmModal';
import { RoleFormModal } from './RoleFormModal';
import { SettingsShell } from './SettingsShell';

export function RolesSettingsScreen() {
  const { t } = useTranslation();
  const { hasPermission } = useAuthStore();
  const roles = useRoles();
  const deleteRole = useDeleteRole();
  const [opened, { open, close }] = useDisclosure(false);
  const [editing, setEditing] = useState<Role | null>(null);
  const [toDelete, setToDelete] = useState<Role | null>(null);

  const openCreate = () => {
    setEditing(null);
    open();
  };
  const openEdit = (r: Role) => {
    setEditing(r);
    open();
  };

  const actions = hasPermission('role.manage') ? (
    <Button leftSection={<IconPlus size={18} />} onClick={openCreate}>
      {t('roles.create')}
    </Button>
  ) : undefined;

  return (
    <SettingsShell active="roles" actions={actions}>
      <Stack gap="lg">
        {roles.data && roles.data.length > 0 && (
          <Table verticalSpacing="md">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t('common.name')}</Table.Th>
                <Table.Th>{t('roles.type')}</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {roles.data.map((r) => (
                <Table.Tr key={r.id}>
                  <Table.Td>
                    <Group gap="xs">
                      <IconShieldCheck size={16} />
                      <Text>{r.name}</Text>
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    {r.isSystem ? (
                      <StatusPill status="accent">{t('roles.system')}</StatusPill>
                    ) : (
                      <StatusPill status="neutral">{t('roles.custom')}</StatusPill>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Group gap="xs" justify="flex-end">
                      {hasPermission('role.manage') && (
                        <ActionIcon
                          variant="subtle"
                          onClick={() => openEdit(r)}
                          aria-label={t('common.edit')}
                        >
                          <IconEdit size={16} />
                        </ActionIcon>
                      )}
                      {hasPermission('role.manage') && !r.isSystem && (
                        <ActionIcon
                          variant="subtle"
                          color="red"
                          onClick={() => setToDelete(r)}
                          aria-label={t('common.delete')}
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

      <RoleFormModal opened={opened} onClose={close} editing={editing} />

      <ConfirmModal
        opened={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={() => {
          if (toDelete) deleteRole.mutate(toDelete.id, { onSuccess: () => setToDelete(null) });
        }}
        message={t('roles.confirm_delete')}
        loading={deleteRole.isPending}
      />
    </SettingsShell>
  );
}
