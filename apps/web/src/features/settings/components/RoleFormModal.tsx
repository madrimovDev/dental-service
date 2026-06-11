import type { Role } from '@dental/api-client';
import { Button, Divider, Group, Modal, Stack, Text, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { zodResolver } from 'mantine-form-zod-resolver';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePermissions, useRole, useUpsertRole } from '../settings.api';
import { type RoleFormValues, roleSchema } from '../settings.schema';
import { PermissionBuilder } from './PermissionBuilder';

export function RoleFormModal({
  opened,
  onClose,
  editing,
}: {
  opened: boolean;
  onClose: () => void;
  editing: Role | null;
}) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const perms = usePermissions();
  const detail = useRole(editing?.id ?? null, opened);
  const upsert = useUpsertRole();

  const form = useForm<RoleFormValues>({
    initialValues: { name: '', description: '' },
    validate: zodResolver(roleSchema),
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: faqat opened/editing/detail o'zgarganda
  useEffect(() => {
    if (!opened) return;
    if (editing) {
      form.setValues({ name: editing.name, description: editing.description ?? '' });
      setSelected(new Set(detail.data?.permissions ?? []));
    } else {
      form.reset();
      setSelected(new Set());
    }
  }, [opened, editing, detail.data]);

  const submit = (values: RoleFormValues) => {
    upsert.mutate(
      {
        id: editing?.id ?? null,
        name: values.name,
        description: values.description,
        permissions: [...selected],
      },
      {
        onSuccess: () => {
          onClose();
          form.reset();
          setSelected(new Set());
        },
      },
    );
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={editing ? `${t('roles.edit')}: ${editing.name}` : t('roles.create')}
      size="lg"
    >
      <form onSubmit={form.onSubmit(submit)}>
        <Stack gap="md">
          <TextInput label={t('common.name')} required {...form.getInputProps('name')} />
          <TextInput label={t('roles.description')} {...form.getInputProps('description')} />
          <Divider label={t('roles.permissions')} labelPosition="center" />
          <PermissionBuilder
            permissions={perms.data ?? []}
            selected={selected}
            onChange={setSelected}
          />
          <Group justify="space-between">
            <Text size="sm" c="dimmed">
              {t('roles.selected_count', { count: selected.size })}
            </Text>
            <Group>
              <Button variant="default" onClick={onClose}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" loading={upsert.isPending}>
                {t('common.save')}
              </Button>
            </Group>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
