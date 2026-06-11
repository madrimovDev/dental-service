import { ApiError } from '@dental/api-client';
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Group,
  Modal,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconKey, IconPlus, IconSearch, IconTrash, IconUserCog } from '@tabler/icons-react';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PhoneInput } from '@/components/PhoneInput.tsx';
import { useAuthStore } from '@/stores/auth-store.ts';
import {
  useBranches,
  useInviteUser,
  useRemoveAssignment,
  useResetPassword,
  useRoles,
  useUsers,
} from '../settings.api';
import { filterAssignments } from '../settings.mappers';
import { type InviteFormValues, inviteSchema } from '../settings.schema';
import type { UsersFilter } from '../settings.types';
import { ConfirmModal } from './ConfirmModal';
import { SettingsShell } from './SettingsShell';
import { StaffProfileModal } from './StaffProfileModal';

export function UsersSettingsScreen() {
  const { t } = useTranslation();
  const { hasPermission, user: currentUser } = useAuthStore();
  const assignments = useUsers();
  const roles = useRoles();
  const branches = useBranches();
  const invite = useInviteUser();
  const removeAssignment = useRemoveAssignment();
  const resetPassword = useResetPassword();

  const [opened, { open, close }] = useDisclosure(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [resetResult, setResetResult] = useState<{ phone: string; tempPassword: string } | null>(
    null,
  );
  const [toRemove, setToRemove] = useState<string | null>(null);
  const [toReset, setToReset] = useState<string | null>(null);
  const [profileEdit, setProfileEdit] = useState<{ userId: string; name: string } | null>(null);
  const [filter, setFilter] = useState<UsersFilter>({ search: '', branchId: null, roleId: null });

  const filtered = useMemo(
    () => filterAssignments(assignments.data ?? [], filter),
    [assignments.data, filter],
  );

  const form = useForm<InviteFormValues>({
    initialValues: { phone: '', fullName: '', roleId: '', branchId: '' },
    validate: zod4Resolver(inviteSchema),
  });

  const closeAll = () => {
    close();
    setTempPassword(null);
    form.reset();
  };

  const submitInvite = (v: InviteFormValues) =>
    invite.mutate(
      { phone: v.phone, fullName: v.fullName, roleId: v.roleId, branchId: v.branchId || undefined },
      {
        onSuccess: (data) => {
          if (data.tempPassword) setTempPassword(data.tempPassword);
          else closeAll();
          form.reset();
        },
      },
    );

  const actions = hasPermission('user.invite') ? (
    <Button leftSection={<IconPlus size={18} />} onClick={open}>
      {t('users.invite')}
    </Button>
  ) : undefined;

  return (
    <SettingsShell active="users" actions={actions}>
      <Stack gap="lg">
        <Group>
          <TextInput
            leftSection={<IconSearch size={16} />}
            placeholder={t('settings.users_search')}
            value={filter.search}
            onChange={(e) => setFilter((f) => ({ ...f, search: e.currentTarget.value }))}
            style={{ flex: 1 }}
          />
          <Select
            placeholder={t('settings.users_filter_branch')}
            clearable
            data={branches.data?.map((b) => ({ value: b.id, label: b.name })) ?? []}
            value={filter.branchId}
            onChange={(v) => setFilter((f) => ({ ...f, branchId: v }))}
          />
          <Select
            placeholder={t('settings.users_filter_role')}
            clearable
            data={roles.data?.map((r) => ({ value: r.id, label: r.name })) ?? []}
            value={filter.roleId}
            onChange={(v) => setFilter((f) => ({ ...f, roleId: v }))}
          />
        </Group>

        {assignments.data && assignments.data.length === 0 && (
          <Text c="dimmed">{t('users.empty')}</Text>
        )}
        {filtered.length > 0 && (
          <Table verticalSpacing="md">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t('users.full_name')}</Table.Th>
                <Table.Th>{t('users.phone')}</Table.Th>
                <Table.Th>{t('users.role')}</Table.Th>
                <Table.Th>{t('users.branch')}</Table.Th>
                <Table.Th>{t('users.status')}</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filtered.map((a) => (
                <Table.Tr key={a.assignmentId}>
                  <Table.Td>{a.userFullName ?? '—'}</Table.Td>
                  <Table.Td>{a.userPhone}</Table.Td>
                  <Table.Td>{a.roleName}</Table.Td>
                  <Table.Td>{a.branchName ?? t('users.all_branches')}</Table.Td>
                  <Table.Td>
                    <Badge color={a.isActive ? 'teal' : 'gray'}>
                      {a.isActive ? t('users.active') : t('users.inactive')}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Group gap="xs" wrap="nowrap" justify="flex-end">
                      {hasPermission('user.manage') && (
                        <ActionIcon
                          variant="subtle"
                          color="gray"
                          onClick={() =>
                            setProfileEdit({
                              userId: a.userId,
                              name: a.userFullName ?? a.userPhone,
                            })
                          }
                          title={t('staff.edit_profile')}
                        >
                          <IconUserCog size={16} />
                        </ActionIcon>
                      )}
                      {hasPermission('user.manage') && a.userId !== currentUser?.id && (
                        <ActionIcon
                          variant="subtle"
                          color="blue"
                          onClick={() => setToReset(a.userId)}
                          title={t('users.reset_password')}
                        >
                          <IconKey size={16} />
                        </ActionIcon>
                      )}
                      {hasPermission('user.manage') && (
                        <ActionIcon
                          variant="subtle"
                          color="red"
                          onClick={() => setToRemove(a.assignmentId)}
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

      {/* Invite modal */}
      <Modal opened={opened} onClose={closeAll} title={t('users.invite')}>
        {tempPassword ? (
          <Stack gap="md">
            <Alert color="teal" variant="light">
              <Text fw={600}>{t('users.invited_successfully')}</Text>
              <Text size="sm">{t('users.temp_password_notice')}</Text>
              <Text mt="sm" fw={700} ff="monospace" size="lg">
                {tempPassword}
              </Text>
            </Alert>
            <Button onClick={closeAll} fullWidth>
              {t('common.cancel')}
            </Button>
          </Stack>
        ) : (
          <form onSubmit={form.onSubmit(submitInvite)}>
            <Stack gap="md">
              <Alert color="blue" variant="light">
                <Text size="sm">{t('users.invite_hint')}</Text>
              </Alert>
              <TextInput
                label={t('users.full_name')}
                required
                {...form.getInputProps('fullName')}
              />
              <PhoneInput label={t('users.phone')} required {...form.getInputProps('phone')} />
              <Select
                label={t('users.role')}
                data={roles.data?.map((r) => ({ value: r.id, label: r.name })) ?? []}
                required
                {...form.getInputProps('roleId')}
              />
              <Select
                label={t('users.branch')}
                description={t('users.branch_hint')}
                data={[
                  { value: '', label: t('users.all_branches') },
                  ...(branches.data?.map((b) => ({ value: b.id, label: b.name })) ?? []),
                ]}
                {...form.getInputProps('branchId')}
              />
              <Group justify="flex-end">
                <Button variant="default" onClick={closeAll}>
                  {t('common.cancel')}
                </Button>
                <Button type="submit" loading={invite.isPending}>
                  {t('users.send_invite')}
                </Button>
              </Group>
            </Stack>
          </form>
        )}
      </Modal>

      {/* Reset password result modal */}
      <Modal
        opened={!!resetResult}
        onClose={() => setResetResult(null)}
        title={t('users.reset_password')}
      >
        {resetResult && (
          <Stack gap="md">
            <Alert color="teal" variant="light">
              <Text fw={600}>{t('users.reset_password_success')}</Text>
              <Text size="sm" mt="xs">
                {resetResult.phone}
              </Text>
              <Text size="sm">{t('users.temp_password_notice')}</Text>
              <Text mt="sm" fw={700} ff="monospace" size="lg">
                {resetResult.tempPassword}
              </Text>
            </Alert>
            <Button onClick={() => setResetResult(null)} fullWidth>
              {t('common.cancel')}
            </Button>
          </Stack>
        )}
      </Modal>

      {/* Remove assignment confirm */}
      <ConfirmModal
        opened={!!toRemove}
        onClose={() => setToRemove(null)}
        onConfirm={() => {
          if (toRemove) removeAssignment.mutate(toRemove, { onSuccess: () => setToRemove(null) });
        }}
        message={t('users.confirm_remove')}
        loading={removeAssignment.isPending}
      />

      {/* Reset password confirm */}
      <ConfirmModal
        opened={!!toReset}
        onClose={() => setToReset(null)}
        onConfirm={() => {
          if (!toReset) return;
          resetPassword.mutate(toReset, {
            onSuccess: (data) => {
              setToReset(null);
              setResetResult({ phone: data.phone, tempPassword: data.tempPassword });
            },
            onError: (err) => {
              setToReset(null);
              notifications.show({
                title: t('common.error'),
                message: err instanceof ApiError ? err.message : t('settings.reset_failed'),
                color: 'red',
              });
            },
          });
        }}
        message={t('users.reset_password_confirm')}
        confirmColor="blue"
        loading={resetPassword.isPending}
      />

      {/* Staff profile edit */}
      {profileEdit && (
        <StaffProfileModal
          key={profileEdit.userId}
          userId={profileEdit.userId}
          userName={profileEdit.name}
          onClose={() => setProfileEdit(null)}
        />
      )}
    </SettingsShell>
  );
}
