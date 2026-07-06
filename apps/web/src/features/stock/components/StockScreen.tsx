import { PageHead, StateView } from '@dental/ui';
import { Alert, Button, Card, Grid, Group, Select, Stack, Tabs } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconAlertTriangle, IconBox, IconList, IconPlus, IconTruck } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/auth-store.ts';
import {
  useBranches,
  useExpiringBatches,
  useServices,
  useStockItems,
  useStockMovements,
} from '../stock.api';
import { toStockItemVM } from '../stock.mappers';
import type { StockItemVM } from '../stock.types';
import { BatchFormModal } from './BatchFormModal';
import { BomPanel } from './BomPanel';
import { ItemFormModal } from './ItemFormModal';
import { MovementFormModal } from './MovementFormModal';
import { MovementHistory } from './MovementHistory';
import { StockItemsTable } from './StockItemsTable';

export function StockScreen() {
  const { t } = useTranslation();
  const { hasPermission } = useAuthStore();
  const canManage = hasPermission('stock.manage');

  const [branchId, setBranchId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [movementItem, setMovementItem] = useState<StockItemVM | null>(null);

  const [itemFormOpened, { open: openItemForm, close: closeItemForm }] = useDisclosure(false);
  const [movementOpened, { open: openMovement, close: closeMovement }] = useDisclosure(false);
  const [batchOpened, { open: openBatch, close: closeBatch }] = useDisclosure(false);

  const branches = useBranches();
  const services = useServices();
  const items = useStockItems(branchId ?? undefined);
  const movements = useStockMovements(selectedId);
  const expiring = useExpiringBatches(30);

  const itemVMs = useMemo(() => (items.data ?? []).map(toStockItemVM), [items.data]);
  const selectedItem = useMemo(
    () => itemVMs.find((i) => i.id === selectedId) ?? null,
    [itemVMs, selectedId],
  );

  const branchOptions = (branches.data ?? []).map((b) => ({ value: b.id, label: b.name }));

  const handleMovement = (item: StockItemVM) => {
    setMovementItem(item);
    openMovement();
  };

  return (
    <>
      <Stack gap="lg">
        <PageHead
          title={t('stock.title')}
          actions={
            canManage && (
              <Group gap="sm">
                <Button variant="default" leftSection={<IconTruck size={18} />} onClick={openBatch}>
                  {t('stock.batch.receive')}
                </Button>
                <Button leftSection={<IconPlus size={18} />} onClick={openItemForm}>
                  {t('stock.create_item')}
                </Button>
              </Group>
            )
          }
        />

        {(expiring.data?.length ?? 0) > 0 && (
          <Alert
            color="orange"
            icon={<IconAlertTriangle size={18} />}
            title={t('stock.batch.expiring_title')}
          >
            {t('stock.batch.expiring_body', { count: expiring.data?.length ?? 0 })}
          </Alert>
        )}

        <Tabs defaultValue="items">
          <Tabs.List mb="md">
            <Tabs.Tab value="items" leftSection={<IconList size={16} />}>
              {t('stock.tab_items')}
            </Tabs.Tab>
            <Tabs.Tab value="bom" leftSection={<IconBox size={16} />}>
              {t('stock.tab_bom')}
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="items">
            <Stack gap="md">
              <Group>
                <Select
                  placeholder={t('stock.all_branches')}
                  aria-label={t('stock.all_branches')}
                  data={branchOptions}
                  value={branchId}
                  onChange={(v) => {
                    setBranchId(v);
                    setSelectedId(null);
                  }}
                  clearable
                  w={260}
                />
              </Group>

              <Grid>
                <Grid.Col span={{ base: 12, md: 7 }}>
                  <Card withBorder padding="md">
                    {items.isError ? (
                      <StateView
                        status="error"
                        title={t('states.error_title')}
                        retryLabel={t('states.retry')}
                        onRetry={() => items.refetch()}
                      />
                    ) : items.isLoading ? (
                      <StateView status="loading" skeleton="table" />
                    ) : (
                      <StockItemsTable
                        items={itemVMs}
                        selectedId={selectedId}
                        onSelect={setSelectedId}
                        canManage={canManage}
                        onMovement={handleMovement}
                      />
                    )}
                  </Card>
                </Grid.Col>
                <Grid.Col span={{ base: 12, md: 5 }}>
                  <Card withBorder padding="md">
                    <MovementHistory
                      itemName={selectedItem?.name ?? null}
                      movements={movements.data ?? []}
                    />
                  </Card>
                </Grid.Col>
              </Grid>
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="bom">
            <Card withBorder padding="md">
              <BomPanel services={services.data ?? []} items={itemVMs} canManage={canManage} />
            </Card>
          </Tabs.Panel>
        </Tabs>
      </Stack>

      <ItemFormModal
        opened={itemFormOpened}
        onClose={closeItemForm}
        branches={branches.data ?? []}
      />
      <MovementFormModal opened={movementOpened} onClose={closeMovement} item={movementItem} />
      <BatchFormModal opened={batchOpened} onClose={closeBatch} items={itemVMs} />
    </>
  );
}
