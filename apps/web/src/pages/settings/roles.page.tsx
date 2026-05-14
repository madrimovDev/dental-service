import type { PermissionDef, Role } from '@dental/api-client';
import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Checkbox,
  Container,
  Divider,
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
import { IconEdit, IconPlus, IconShieldCheck, IconTrash } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from 'mantine-form-zod-resolver';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { api } from '@/lib/api.ts';
import { useAuthStore } from '@/stores/auth-store.ts';

const schema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(500).optional(),
});
type FormValues = z.infer<typeof schema>;

export function RolesSettingsPage() {
  const { t, i18n } = useTranslation();
  const { hasPermission } = useAuthStore();
  const qc = useQueryClient();
  const [opened, { open, close }] = useDisclosure(false);
  const [editing, setEditing] = useState<Role | null>(null);
  const [selectedPerms, setSelectedPerms] = useState<Set<string>>(new Set());

  const rolesQuery = useQuery({ queryKey: ['roles'], queryFn: api.roles.list });
  const permsQuery = useQuery({ queryKey: ['permissions'], queryFn: api.permissions.list });
  const detailQuery = useQuery({
    queryKey: ['role', editing?.id],
    queryFn: () => api.roles.get(editing?.id ?? ''),
    enabled: !!editing?.id && opened,
  });

  const form = useForm<FormValues>({
    initialValues: { name: '', description: '' },
    validate: zodResolver(schema),
  });

  useEffect(() => {
    if (detailQuery.data) {
      setSelectedPerms(new Set(detailQuery.data.permissions ?? []));
    }
  }, [detailQuery.data]);

  const permsByCategory = useMemo(() => {
    const out: Record<string, PermissionDef[]> = {};
    for (const p of permsQuery.data ?? []) {
      const list = out[p.category];
      if (list) list.push(p);
      else out[p.category] = [p];
    }
    return out;
  }, [permsQuery.data]);

  const upsertMut = useMutation({
    mutationFn: async (values: FormValues) => {
      const permsList = Array.from(selectedPerms);
      if (editing) {
        await api.roles.update(editing.id, values);
        await api.roles.setPermissions(editing.id, permsList);
      } else {
        const created = await api.roles.create({ ...values, permissions: permsList });
        return created;
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['roles'] });
      close();
      setEditing(null);
      form.reset();
      setSelectedPerms(new Set());
    },
  });

  const deleteMut = useMutation({
    mutationFn: api.roles.remove,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['roles'] }),
  });

  const openCreate = () => {
    setEditing(null);
    form.reset();
    setSelectedPerms(new Set());
    open();
  };

  const openEdit = (r: Role) => {
    setEditing(r);
    form.setValues({ name: r.name, description: r.description ?? '' });
    open();
  };

  const togglePerm = (code: string, checked: boolean) => {
    setSelectedPerms((prev) => {
      const next = new Set(prev);
      if (checked) next.add(code);
      else next.delete(code);
      return next;
    });
  };

  return (
    <Container size="lg">
      <Stack gap="lg">
        <Group justify="space-between">
          <Title order={2}>{t('nav.roles')}</Title>
          {hasPermission('role.manage') && (
            <Button leftSection={<IconPlus size={18} />} onClick={openCreate}>
              {t('roles.create')}
            </Button>
          )}
        </Group>

        {rolesQuery.data && rolesQuery.data.length > 0 && (
          <Table verticalSpacing="md">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t('common.name')}</Table.Th>
                <Table.Th>{t('roles.type')}</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rolesQuery.data.map((r) => (
                <Table.Tr key={r.id}>
                  <Table.Td>
                    <Group gap="xs">
                      <IconShieldCheck size={16} />
                      <Text>{r.name}</Text>
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    {r.isSystem ? (
                      <Badge color="blue">{t('roles.system')}</Badge>
                    ) : (
                      <Badge color="teal">{t('roles.custom')}</Badge>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Group gap="xs" justify="flex-end">
                      {hasPermission('role.manage') && (
                        <ActionIcon variant="subtle" onClick={() => openEdit(r)}>
                          <IconEdit size={16} />
                        </ActionIcon>
                      )}
                      {hasPermission('role.manage') && !r.isSystem && (
                        <ActionIcon
                          variant="subtle"
                          color="red"
                          onClick={() => {
                            if (confirm(t('roles.confirm_delete'))) {
                              deleteMut.mutate(r.id);
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
        title={editing ? `${t('roles.edit')}: ${editing.name}` : t('roles.create')}
        size="lg"
      >
        <form onSubmit={form.onSubmit((values) => upsertMut.mutate(values))}>
          <Stack gap="md">
            <TextInput label={t('common.name')} required {...form.getInputProps('name')} />
            <TextInput label={t('roles.description')} {...form.getInputProps('description')} />

            <Divider label={t('roles.permissions')} labelPosition="center" />

            <Stack gap="sm">
              {Object.entries(permsByCategory).map(([category, perms]) => (
                <Card key={category} withBorder padding="sm" radius="md">
                  <Text fw={600} size="sm" tt="capitalize" mb="xs">
                    {category}
                  </Text>
                  <Stack gap="xs">
                    {perms.map((p) => {
                      const desc = i18n.language === 'ru' ? p.descriptionRu : p.descriptionUz;
                      return (
                        <Checkbox
                          key={p.id}
                          label={
                            <Stack gap={0}>
                              <Text size="sm" ff="monospace">
                                {p.code}
                              </Text>
                              {desc && (
                                <Text size="xs" c="dimmed">
                                  {desc}
                                </Text>
                              )}
                            </Stack>
                          }
                          checked={selectedPerms.has(p.code)}
                          onChange={(e) => togglePerm(p.code, e.currentTarget.checked)}
                        />
                      );
                    })}
                  </Stack>
                </Card>
              ))}
            </Stack>

            <Group justify="space-between">
              <Text size="sm" c="dimmed">
                {t('roles.selected_count', { count: selectedPerms.size })}
              </Text>
              <Group>
                <Button variant="default" onClick={close}>
                  {t('common.cancel')}
                </Button>
                <Button type="submit" loading={upsertMut.isPending}>
                  {t('common.save')}
                </Button>
              </Group>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Container>
  );
}
