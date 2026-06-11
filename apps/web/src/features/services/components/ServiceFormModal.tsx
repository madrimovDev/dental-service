import type { Service } from '@dental/api-client';
import { Button, Group, Modal, Stack, Tabs } from '@mantine/core';
import { useForm } from '@mantine/form';
import { zodResolver } from 'mantine-form-zod-resolver';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useBranches, useServiceDetail, useSetPrice, useUpsertService } from '../services.api';
import { serviceFormSchema } from '../services.schema';
import type { ServiceFormValues } from '../services.types';
import { ServiceInfoTab } from './ServiceInfoTab';
import { ServicePricesTab } from './ServicePricesTab';

const EMPTY: ServiceFormValues = {
  code: '',
  nameUz: '',
  nameRu: '',
  category: '',
  durationMinutes: 30,
  requiredRole: '',
  descriptionUz: '',
  descriptionRu: '',
  isActive: true,
  initialBranchId: undefined,
  initialPrice: undefined,
};

export function ServiceFormModal({
  opened,
  onClose,
  editing,
}: {
  opened: boolean;
  onClose: () => void;
  editing: Service | null;
}) {
  const { t } = useTranslation();
  const isEditing = !!editing;

  const branches = useBranches();
  const detail = useServiceDetail(editing?.id ?? null, opened);
  const upsert = useUpsertService(editing);
  const setPrice = useSetPrice(editing?.id ?? null);

  const form = useForm<ServiceFormValues>({
    initialValues: EMPTY,
    validate: zodResolver(serviceFormSchema),
  });

  // editing o'zgarganda formani to'ldirish / tozalash
  // biome-ignore lint/correctness/useExhaustiveDependencies: form.setValues stable; faqat opened/editing.id ga reaksiya
  useEffect(() => {
    if (!opened) return;
    if (editing) {
      form.setValues({
        ...EMPTY,
        code: editing.code,
        nameUz: editing.nameUz,
        nameRu: editing.nameRu ?? '',
        category: editing.category ?? '',
        durationMinutes: editing.durationMinutes,
        requiredRole: editing.requiredRole ?? '',
        descriptionUz: editing.descriptionUz ?? '',
        descriptionRu: editing.descriptionRu ?? '',
        isActive: editing.isActive,
      });
    } else {
      form.setValues(EMPTY);
    }
  }, [opened, editing?.id]);

  const handleClose = () => {
    form.reset();
    onClose();
  };

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={isEditing ? `${t('services.edit')}: ${editing.code}` : t('services.create')}
      size="lg"
    >
      <Tabs defaultValue="info">
        <Tabs.List mb="md">
          <Tabs.Tab value="info">{t('services.tab_info')}</Tabs.Tab>
          <Tabs.Tab value="prices">{t('services.tab_prices')}</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="info">
          <form
            onSubmit={form.onSubmit((values) => upsert.mutate(values, { onSuccess: handleClose }))}
          >
            <Stack gap="md">
              <ServiceInfoTab form={form} isEditing={isEditing} />
              <Group justify="flex-end">
                <Button variant="default" onClick={handleClose}>
                  {t('common.cancel')}
                </Button>
                <Button type="submit" loading={upsert.isPending}>
                  {t('common.save')}
                </Button>
              </Group>
            </Stack>
          </form>
        </Tabs.Panel>

        <Tabs.Panel value="prices">
          <ServicePricesTab
            isEditing={isEditing}
            prices={detail.data?.prices ?? []}
            branches={branches.data ?? []}
            onSetPrice={(branchId, price) => setPrice.mutate({ branchId, price })}
            loading={setPrice.isPending}
          />
        </Tabs.Panel>
      </Tabs>
    </Modal>
  );
}
