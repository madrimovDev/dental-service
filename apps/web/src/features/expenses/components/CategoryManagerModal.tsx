import type { ExpenseCategory } from '@dental/api-client';
import { ActionIcon, Button, Group, Modal, Stack, Table, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconTrash } from '@tabler/icons-react';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { useTranslation } from 'react-i18next';
import { useCreateCategory, useDeleteCategory } from '../expenses.api';
import { type CategoryFormValues, categoryFormSchema } from '../expenses.schema';

export interface CategoryManagerModalProps {
  opened: boolean;
  onClose: () => void;
  categories: ExpenseCategory[];
}

export function CategoryManagerModal({ opened, onClose, categories }: CategoryManagerModalProps) {
  const { t } = useTranslation();
  const create = useCreateCategory();
  const remove = useDeleteCategory();

  const form = useForm<CategoryFormValues>({
    initialValues: { name: '', nameRu: undefined },
    validate: zod4Resolver(categoryFormSchema),
  });

  const handleCreate = (values: CategoryFormValues) => {
    create.mutate(
      { name: values.name, nameRu: values.nameRu || undefined },
      { onSuccess: () => form.reset() },
    );
  };

  return (
    <Modal opened={opened} onClose={onClose} title={t('expenses.categories')} size="md">
      <Stack gap="md">
        <form onSubmit={form.onSubmit(handleCreate)}>
          <Group align="flex-end">
            <TextInput
              label={t('expenses.category_name')}
              flex={1}
              {...form.getInputProps('name')}
            />
            <TextInput
              label={t('expenses.category_name_ru')}
              flex={1}
              {...form.getInputProps('nameRu')}
            />
            <Button type="submit" loading={create.isPending}>
              {t('expenses.add')}
            </Button>
          </Group>
        </form>

        <Table>
          <Table.Tbody>
            {categories.map((c) => (
              <Table.Tr key={c.id}>
                <Table.Td>{c.name}</Table.Td>
                <Table.Td c="dimmed">{c.nameRu ?? '—'}</Table.Td>
                <Table.Td w={48}>
                  <ActionIcon
                    color="red"
                    variant="subtle"
                    loading={remove.isPending}
                    onClick={() => remove.mutate(c.id)}
                    aria-label={t('common.delete')}
                  >
                    <IconTrash size={16} />
                  </ActionIcon>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Stack>
    </Modal>
  );
}
