import type { ServiceCategory } from '@dental/api-client';
import { Button, Group, Modal, Stack, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useUpsertServiceCategory } from '../service-categories.api';
import { serviceCategoryFormSchema } from '../service-categories.schema';
import type { ServiceCategoryFormValues } from '../service-categories.types';

export function ServiceCategoryFormModal({
  opened,
  onClose,
  editing,
}: {
  opened: boolean;
  onClose: () => void;
  editing: ServiceCategory | null;
}) {
  const { t } = useTranslation();
  const upsert = useUpsertServiceCategory(editing);
  const form = useForm<ServiceCategoryFormValues>({
    initialValues: { name: '', nameRu: '' },
    validate: zod4Resolver(serviceCategoryFormSchema),
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: form methods are stable
  useEffect(() => {
    if (opened) {
      form.setValues({ name: editing?.name ?? '', nameRu: editing?.nameRu ?? '' });
      form.resetDirty();
    }
  }, [opened, editing]);

  const submit = form.onSubmit((values) => {
    upsert.mutate(values, { onSuccess: onClose });
  });

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={editing ? t('serviceCategories.edit') : t('serviceCategories.create')}
      size="sm"
    >
      <form onSubmit={submit}>
        <Stack gap="md">
          <TextInput label={t('serviceCategories.name')} required {...form.getInputProps('name')} />
          <TextInput label={t('serviceCategories.name_ru')} {...form.getInputProps('nameRu')} />
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
