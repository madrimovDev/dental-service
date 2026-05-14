import { ApiError } from '@dental/api-client';
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Container,
  Group,
  Modal,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconKey, IconPlus, IconTrash } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from 'mantine-form-zod-resolver';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { api } from '@/lib/api.ts';
import { useAuthStore } from '@/stores/auth-store.ts';

const schema = z.object({
  email: z.email(),
  phone: z
    .string()
    .regex(/^\+?\d{9,15}$/)
    .optional()
    .or(z.literal('')),
  fullName: z.string().min(2).max(120),
  roleId: z.string().min(1),
  branchId: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

export function UsersSettingsPage() {
  const { t } = useTranslation();
  const { hasPermission, user: currentUser } = useAuthStore();
  const qc = useQueryClient();
  const [opened, { open, close }] = useDisclosure(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [resetResult, setResetResult] = useState<{ email: string; tempPassword: string } | null>(
    null,
  );

  const assignments = useQuery({
    queryKey: ['users', 'assignments'],
    queryFn: api.users.listAssignments,
  });
  const roles = useQuery({ queryKey: ['roles'], queryFn: api.roles.list });
  const branches = useQuery({ queryKey: ['branches'], queryFn: api.branches.list });

  const form = useForm<FormValues>({
    initialValues: { email: '', phone: '', fullName: '', roleId: '', branchId: '' },
    validate: zodResolver(schema),
  });

  const inviteMut = useMutation({
    mutationFn: (v: FormValues) =>
      api.users.invite({
        email: v.email,
        phone: v.phone || undefined,
        fullName: v.fullName,
        roleId: v.roleId,
        branchId: v.branchId || undefined,
      }),
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: ['users', 'assignments'] });
      if (data.tempPassword) {
        setTempPassword(data.tempPassword);
      } else {
        close();
      }
      form.reset();
    },
  });

  const deleteAssignmentMut = useMutation({
    mutationFn: api.users.removeAssignment,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users', 'assignments'] }),
  });

  const resetPasswordMut = useMutation({
    mutationFn: api.users.resetPassword,
    onSuccess: (data) => {
      setResetResult({ email: data.email, tempPassword: data.tempPassword });
    },
    onError: (err) => {
      notifications.show({
        title: t('common.error'),
        message: err instanceof ApiError ? err.message : 'Reset failed',
        color: 'red',
      });
    },
  });

  const closeAll = () => {
    close();
    setTempPassword(null);
  };

  return (
    <Container size="lg">
      <Stack gap="lg">
        <Group justify="space-between">
          <Title order={2}>{t('nav.users')}</Title>
          {hasPermission('user.invite') && (
            <Button leftSection={<IconPlus size={18} />} onClick={open}>
              {t('users.invite')}
            </Button>
          )}
        </Group>

        {assignments.data && assignments.data.length === 0 && (
          <Text c="dimmed">{t('users.empty')}</Text>
        )}
        {assignments.data && assignments.data.length > 0 && (
          <Table verticalSpacing="md">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t('users.full_name')}</Table.Th>
                <Table.Th>{t('users.email')}</Table.Th>
                <Table.Th>{t('users.role')}</Table.Th>
                <Table.Th>{t('users.branch')}</Table.Th>
                <Table.Th>{t('users.status')}</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {assignments.data.map((a) => (
                <Table.Tr key={a.assignmentId}>
                  <Table.Td>{a.userFullName ?? '—'}</Table.Td>
                  <Table.Td>{a.userEmail}</Table.Td>
                  <Table.Td>{a.roleName}</Table.Td>
                  <Table.Td>{a.branchName ?? t('users.all_branches')}</Table.Td>
                  <Table.Td>
                    <Badge color={a.isActive ? 'teal' : 'gray'}>
                      {a.isActive ? t('users.active') : t('users.inactive')}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Group gap="xs" wrap="nowrap" justify="flex-end">
                      {hasPermission('user.manage') && a.userId !== currentUser?.id && (
                        <ActionIcon
                          variant="subtle"
                          color="blue"
                          onClick={() => {
                            if (confirm(t('users.reset_password_confirm'))) {
                              resetPasswordMut.mutate(a.userId);
                            }
                          }}
                          loading={resetPasswordMut.isPending}
                          title={t('users.reset_password')}
                        >
                          <IconKey size={16} />
                        </ActionIcon>
                      )}
                      {hasPermission('user.manage') && (
                        <ActionIcon
                          variant="subtle"
                          color="red"
                          onClick={() => {
                            if (confirm(t('users.confirm_remove'))) {
                              deleteAssignmentMut.mutate(a.assignmentId);
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
          <form onSubmit={form.onSubmit((values) => inviteMut.mutate(values))}>
            <Stack gap="md">
              <Alert color="blue" variant="light">
                <Text size="sm">{t('users.invite_hint')}</Text>
              </Alert>
              <TextInput
                label={t('users.full_name')}
                required
                {...form.getInputProps('fullName')}
              />
              <TextInput
                label={t('users.email')}
                type="email"
                required
                {...form.getInputProps('email')}
              />
              <TextInput
                label={t('users.phone')}
                placeholder="+998... (ixtiyoriy)"
                {...form.getInputProps('phone')}
              />
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
                <Button type="submit" loading={inviteMut.isPending}>
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
                {resetResult.email}
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
    </Container>
  );
}
