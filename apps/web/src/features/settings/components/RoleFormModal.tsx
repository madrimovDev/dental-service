import type { Role } from '@dental/api-client';
import { Button, Group, Modal, Stack, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useRole, useUpsertRole } from '../settings.api';
import { type RoleFormValues, roleSchema } from '../settings.schema';

/**
 * Rol nomi/tavsifini yaratish/tahrirlash modali (DS10).
 * Ruxsatlar endi inline o'ng panelda (PermissionBuilder) — modaldan OLIB TASHLANDI.
 * `useUpsertRole` payload (`{id,name,description,permissions[]}`) O'ZGARMAYDI:
 * yangi rol → `permissions:[]`; nom tahriri → mavjud ruxsatlar saqlanadi (detail'dan).
 */
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
  const detail = useRole(editing?.id ?? null, opened);
  const upsert = useUpsertRole();

  const form = useForm<RoleFormValues>({
    initialValues: { name: '', description: '' },
    validate: zod4Resolver(roleSchema),
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: faqat opened/editing o'zgarganda
  useEffect(() => {
    if (!opened) return;
    if (editing) {
      form.setValues({ name: editing.name, description: editing.description ?? '' });
    } else {
      form.reset();
    }
  }, [opened, editing]);

  const submit = (values: RoleFormValues) => {
    upsert.mutate(
      {
        id: editing?.id ?? null,
        name: values.name,
        description: values.description,
        permissions: editing ? (detail.data?.permissions ?? []) : [],
      },
      {
        onSuccess: () => {
          onClose();
          form.reset();
        },
      },
    );
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={editing ? `${t('roles.edit')}: ${editing.name}` : t('roles.create')}
    >
      <form onSubmit={form.onSubmit(submit)}>
        <Stack gap="md">
          <TextInput label={t('common.name')} required {...form.getInputProps('name')} />
          <TextInput label={t('roles.description')} {...form.getInputProps('description')} />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={upsert.isPending}>
              {t('common.save')}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
