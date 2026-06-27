import {
  Autocomplete,
  NumberInput,
  Select,
  Stack,
  Switch,
  Textarea,
  TextInput,
} from '@mantine/core';
import type { UseFormReturnType } from '@mantine/form';
import { useTranslation } from 'react-i18next';
import { useServiceCategories } from '@/features/service-categories';
import type { ServiceFormValues } from '../services.types';

export function ServiceInfoTab({
  form,
  isEditing,
}: {
  form: UseFormReturnType<ServiceFormValues>;
  isEditing: boolean;
}) {
  const { t } = useTranslation();
  const categories = useServiceCategories();
  const categoryData = (categories.data ?? []).map((c) => c.name);

  const roleOptions = [
    { value: '', label: t('services.role_none') },
    { value: 'doctor', label: t('services.role_doctor') },
    { value: 'assistant', label: t('services.role_assistant') },
    { value: 'technician', label: t('services.role_technician') },
  ];

  return (
    <Stack gap="md">
      <TextInput
        label={t('services.code')}
        required
        disabled={isEditing}
        {...form.getInputProps('code')}
      />
      <Autocomplete
        label={t('services.category')}
        placeholder={t('services.category_placeholder')}
        data={categoryData}
        {...form.getInputProps('category')}
      />
      <TextInput label={t('services.name_uz')} required {...form.getInputProps('nameUz')} />
      <TextInput label={t('services.name_ru')} {...form.getInputProps('nameRu')} />
      <NumberInput
        label={t('services.duration_minutes')}
        min={5}
        step={5}
        {...form.getInputProps('durationMinutes')}
      />
      <Select
        label={t('services.required_role')}
        data={roleOptions}
        allowDeselect={false}
        {...form.getInputProps('requiredRole')}
      />
      <Textarea
        label={t('services.description_uz')}
        autosize
        minRows={2}
        {...form.getInputProps('descriptionUz')}
      />
      <Textarea
        label={t('services.description_ru')}
        autosize
        minRows={2}
        {...form.getInputProps('descriptionRu')}
      />
      <Switch
        label={t('services.is_active')}
        checked={form.values.isActive}
        {...form.getInputProps('isActive', { type: 'checkbox' })}
      />
    </Stack>
  );
}
