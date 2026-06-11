import type { ServicePrice } from '@dental/api-client';
import { Mono } from '@dental/ui';
import { Button, Group, NumberInput, Select, Stack, Table, Text } from '@mantine/core';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

const formatUZS = (n: string | number) =>
  `${new Intl.NumberFormat('uz-UZ').format(typeof n === 'string' ? Number(n) : n)} so'm`;

export function ServicePricesTab({
  isEditing,
  prices,
  branches,
  onSetPrice,
  loading,
}: {
  isEditing: boolean;
  prices: ServicePrice[];
  branches: Array<{ id: string; name: string }>;
  onSetPrice: (branchId: string, price: number) => void;
  loading: boolean;
}) {
  const { t } = useTranslation();
  const [branchId, setBranchId] = useState<string | null>(null);
  const [price, setPrice] = useState<number | ''>('');

  if (!isEditing) {
    return (
      <Text c="dimmed" size="sm">
        {t('services.save_first')}
      </Text>
    );
  }

  return (
    <Stack gap="sm">
      <Text fw={600}>{t('services.prices_per_branch')}</Text>
      {prices.length === 0 ? (
        <Text c="dimmed" size="sm">
          {t('services.no_prices')}
        </Text>
      ) : (
        <Table>
          <Table.Tbody>
            {prices.map((p) => (
              <Table.Tr key={p.id}>
                <Table.Td>{branches.find((b) => b.id === p.branchId)?.name ?? p.branchId}</Table.Td>
                <Table.Td>
                  <Mono>{formatUZS(p.price)}</Mono>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
      <Group align="flex-end">
        <Select
          label={t('services.branch')}
          data={branches.map((b) => ({ value: b.id, label: b.name }))}
          value={branchId}
          onChange={setBranchId}
          clearable
          flex={1}
        />
        <NumberInput
          label={t('services.price')}
          min={0}
          step={1000}
          suffix=" so'm"
          value={price}
          onChange={(v) => setPrice(typeof v === 'number' ? v : Number(v))}
          flex={1}
        />
        <Button
          disabled={!branchId || !price}
          loading={loading}
          onClick={() => {
            if (branchId && typeof price === 'number') {
              onSetPrice(branchId, price);
              setPrice('');
              setBranchId(null);
            }
          }}
        >
          {t('services.set_price')}
        </Button>
      </Group>
    </Stack>
  );
}
