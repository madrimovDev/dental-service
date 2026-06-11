import type { Branch, ExpenseCategory } from '@dental/api-client';
import {
  Button,
  Group,
  Modal,
  NumberInput,
  Select,
  Stack,
  Textarea,
  TextInput,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useCreateExpense } from '../expenses.api';
import { type ExpenseFormValues, expenseFormSchema } from '../expenses.schema';

const todayISO = () => new Date().toISOString().slice(0, 10);

const emptyValues = (): ExpenseFormValues => ({
  amount: 0,
  date: todayISO(),
  categoryId: undefined,
  branchId: undefined,
  note: undefined,
});

export interface ExpenseFormModalProps {
  opened: boolean;
  onClose: () => void;
  categories: ExpenseCategory[];
  branches: Branch[];
}

export function ExpenseFormModal({ opened, onClose, categories, branches }: ExpenseFormModalProps) {
  const { t, i18n } = useTranslation();
  const create = useCreateExpense();

  const form = useForm<ExpenseFormValues>({
    initialValues: emptyValues(),
    validate: zod4Resolver(expenseFormSchema),
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: faqat opened ga reaksiya
  useEffect(() => {
    if (opened) form.setValues(emptyValues());
  }, [opened]);

  const handleClose = () => {
    form.reset();
    onClose();
  };

  const categoryOptions = categories.map((c) => ({
    value: c.id,
    label: i18n.language === 'ru' && c.nameRu ? c.nameRu : c.name,
  }));
  const branchOptions = branches.map((b) => ({ value: b.id, label: b.name }));

  return (
    <Modal opened={opened} onClose={handleClose} title={t('expenses.create')} size="md">
      <form
        onSubmit={form.onSubmit((values) =>
          create.mutate(
            {
              amount: values.amount,
              date: values.date,
              categoryId: values.categoryId || undefined,
              branchId: values.branchId || undefined,
              note: values.note || undefined,
            },
            { onSuccess: handleClose },
          ),
        )}
      >
        <Stack gap="md">
          <NumberInput
            label={t('expenses.amount')}
            min={0}
            thousandSeparator=" "
            withAsterisk
            {...form.getInputProps('amount')}
          />
          <TextInput
            type="date"
            label={t('expenses.date')}
            withAsterisk
            {...form.getInputProps('date')}
          />
          <Select
            label={t('expenses.category')}
            placeholder={t('expenses.uncategorized')}
            data={categoryOptions}
            clearable
            {...form.getInputProps('categoryId')}
          />
          <Select
            label={t('expenses.branch')}
            placeholder={t('expenses.all_branches')}
            data={branchOptions}
            clearable
            {...form.getInputProps('branchId')}
          />
          <Textarea label={t('expenses.note')} rows={2} {...form.getInputProps('note')} />
          <Group justify="flex-end">
            <Button variant="default" onClick={handleClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={create.isPending}>
              {t('common.save')}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
