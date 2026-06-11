import type { Service } from '@dental/api-client';
import { ActionIcon, Button, Group, NumberInput, Select, Stack, Table, Text } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconTrash } from '@tabler/icons-react';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCreateBom, useRemoveBom, useServiceMaterials } from '../stock.api';
import { toServiceMaterialVM } from '../stock.mappers';
import { type BomFormSchema, bomFormSchema } from '../stock.schema';
import type { StockItemVM } from '../stock.types';

export interface BomPanelProps {
  services: Service[];
  items: StockItemVM[];
  canManage: boolean;
}

/** BOM boshqaruv: xizmat → material (qtyPerService). */
export function BomPanel({ services, items, canManage }: BomPanelProps) {
  const { t } = useTranslation();
  const [serviceId, setServiceId] = useState<string | null>(null);

  const bom = useServiceMaterials(serviceId ?? undefined);
  const createBom = useCreateBom();
  const removeBom = useRemoveBom();

  const form = useForm<BomFormSchema>({
    initialValues: { serviceId: serviceId ?? '', itemId: '', qtyPerService: 1 },
    validate: zod4Resolver(bomFormSchema),
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: serviceId o'zgarganda formaga ko'chiriladi
  useEffect(() => {
    form.setFieldValue('serviceId', serviceId ?? '');
  }, [serviceId]);

  const serviceOptions = services.map((s) => ({ value: s.id, label: s.nameUz }));
  const itemOptions = items.map((i) => ({ value: i.id, label: `${i.name} (${i.unit})` }));

  const itemName = useMemo(() => {
    const map = new Map(items.map((i) => [i.id, i]));
    return (id: string) => map.get(id)?.name ?? id;
  }, [items]);

  const rows = (bom.data ?? []).map(toServiceMaterialVM);

  return (
    <Stack gap="md">
      <Select
        label={t('stock.bom_service')}
        placeholder={t('common.select')}
        data={serviceOptions}
        value={serviceId}
        onChange={setServiceId}
        searchable
        clearable
      />

      {serviceId && (
        <>
          {rows.length === 0 ? (
            <Text c="dimmed" size="sm">
              {t('stock.bom_empty')}
            </Text>
          ) : (
            <Table verticalSpacing="xs">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t('stock.material')}</Table.Th>
                  <Table.Th>{t('stock.qty_per_service')}</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {rows.map((r) => (
                  <Table.Tr key={r.id}>
                    <Table.Td>{itemName(r.itemId)}</Table.Td>
                    <Table.Td>{r.qtyPerService}</Table.Td>
                    <Table.Td>
                      {canManage && (
                        <ActionIcon
                          variant="subtle"
                          color="red"
                          aria-label={t('common.delete')}
                          onClick={() => removeBom.mutate(r.id)}
                        >
                          <IconTrash size={16} />
                        </ActionIcon>
                      )}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}

          {canManage && (
            <form
              onSubmit={form.onSubmit((values) =>
                createBom.mutate(
                  {
                    serviceId: values.serviceId,
                    itemId: values.itemId,
                    qtyPerService: values.qtyPerService,
                  },
                  { onSuccess: () => form.setValues({ ...values, itemId: '', qtyPerService: 1 }) },
                ),
              )}
            >
              <Group align="flex-end">
                <Select
                  label={t('stock.material')}
                  placeholder={t('common.select')}
                  data={itemOptions}
                  searchable
                  flex={1}
                  {...form.getInputProps('itemId')}
                />
                <NumberInput
                  label={t('stock.qty_per_service')}
                  min={0}
                  w={160}
                  {...form.getInputProps('qtyPerService')}
                />
                <Button type="submit" loading={createBom.isPending}>
                  {t('common.create')}
                </Button>
              </Group>
            </form>
          )}
        </>
      )}
    </Stack>
  );
}
