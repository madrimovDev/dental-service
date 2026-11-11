import { AlertBanner, Button, PageHead, StateView } from '@dental/ui';
import { Card, Grid, Group, Select, Stack, Tabs } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/auth-store.ts';
import {
  useAutoDeductionsToday,
  useBranches,
  useExpiringBatches,
  useServiceMaterials,
  useServices,
  useStockItems,
  useStockMovements,
} from '../stock.api';
import {
  DAYS_CRITICAL,
  formatQty,
  servicesByItem,
  sortCriticalFirst,
  toExpiringBatchVMs,
  toServiceMaterialVM,
  toStockItemVM,
} from '../stock.mappers';
import type { StockItemVM } from '../stock.types';
import { AutoDeductionLog } from './AutoDeductionLog';
import { BatchFormModal } from './BatchFormModal';
import { BomPanel } from './BomPanel';
import { ItemFormModal } from './ItemFormModal';
import { MovementFormModal } from './MovementFormModal';
import { MovementHistory } from './MovementHistory';
import { StockItemsTable } from './StockItemsTable';

const EXPIRING_WITHIN_DAYS = 30;

export function StockScreen() {
  const { t, i18n } = useTranslation();
  const { hasPermission } = useAuthStore();
  const canManage = hasPermission('stock.manage');

  const [branchId, setBranchId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [movementItem, setMovementItem] = useState<StockItemVM | null>(null);
  const [receiveItemId, setReceiveItemId] = useState<string | null>(null);
  const [criticalFirst, setCriticalFirst] = useState(true);
  const [category, setCategory] = useState<string | null>(null);

  const [itemFormOpened, { open: openItemForm, close: closeItemForm }] = useDisclosure(false);
  const [movementOpened, { open: openMovement, close: closeMovement }] = useDisclosure(false);
  const [batchOpened, { open: openBatch, close: closeBatch }] = useDisclosure(false);

  const branches = useBranches();
  const services = useServices({ enabled: hasPermission('service.view') });
  const items = useStockItems(branchId ?? undefined);
  const movements = useStockMovements(selectedId);
  const expiring = useExpiringBatches(EXPIRING_WITHIN_DAYS, branchId ?? undefined);
  const autoToday = useAutoDeductionsToday(branchId ?? undefined);
  const bom = useServiceMaterials();

  const itemVMs = useMemo(() => (items.data ?? []).map(toStockItemVM), [items.data]);
  const selectedItem = useMemo(
    () => itemVMs.find((i) => i.id === selectedId) ?? null,
    [itemVMs, selectedId],
  );

  const categories = useMemo(
    () => [...new Set(itemVMs.map((i) => i.category).filter((c): c is string => !!c))].sort(),
    [itemVMs],
  );
  const visibleItems = useMemo(() => {
    const filtered = category ? itemVMs.filter((i) => i.category === category) : itemVMs;
    return criticalFirst ? sortCriticalFirst(filtered) : filtered;
  }, [itemVMs, category, criticalFirst]);

  const serviceName = useMemo(() => {
    const byId = new Map(
      (services.data ?? []).map((s) => [
        s.id,
        i18n.language === 'ru' ? (s.nameRu ?? s.nameUz) : s.nameUz,
      ]),
    );
    return (id: string) => byId.get(id);
  }, [services.data, i18n.language]);
  const usedIn = useMemo(
    () => servicesByItem((bom.data ?? []).map(toServiceMaterialVM), serviceName),
    [bom.data, serviceName],
  );

  const expiringBatches = useMemo(() => toExpiringBatchVMs(expiring.data ?? []), [expiring.data]);
  const topBatch = expiringBatches[0];
  const endingCount = itemVMs.filter(
    (i) => i.daysLeft != null && i.daysLeft <= DAYS_CRITICAL,
  ).length;

  const branchOptions = (branches.data ?? []).map((b) => ({ value: b.id, label: b.name }));
  const branchName = branchOptions.find((b) => b.value === branchId)?.label;

  const dateFmt = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language === 'ru' ? 'ru-RU' : 'uz-UZ', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }),
    [i18n.language],
  );

  const handleMovement = (item: StockItemVM) => {
    setMovementItem(item);
    openMovement();
  };
  const handleReceive = (itemId: string | null) => {
    setReceiveItemId(itemId);
    openBatch();
  };

  return (
    <>
      <Stack gap="lg">
        <PageHead
          title={
            branchName ? t('stockScreen.titleBranch', { branch: branchName }) : t('stock.title')
          }
          subtitle={t('stockScreen.summary', {
            total: itemVMs.length,
            low: endingCount,
            expiring: expiringBatches.length,
          })}
          actions={
            canManage && (
              <Group gap="sm">
                <Button onClick={openItemForm}>{t('stock.create_item')}</Button>
                <Button variant="primary" onClick={() => handleReceive(null)}>
                  {t('stockScreen.receive')}
                </Button>
              </Group>
            )
          }
        />

        <Tabs defaultValue="items">
          <Tabs.List mb="md">
            <Tabs.Tab value="items">{t('stock.tab_items')}</Tabs.Tab>
            <Tabs.Tab value="bom">{t('stock.tab_bom')}</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="items">
            <Grid>
              <Grid.Col span={{ base: 12, lg: 8 }}>
                <Stack gap="md">
                  {topBatch && (
                    <AlertBanner
                      tier={2}
                      title={t('stockScreen.expiringTitle', {
                        item: topBatch.itemName,
                        batch: topBatch.batchNumber ?? t('stockScreen.noBatchNumber'),
                      })}
                      action={{
                        label: t('stockScreen.useFirst'),
                        onClick: () => setSelectedId(topBatch.itemId),
                      }}
                    >
                      {t(
                        topBatch.expired ? 'stockScreen.expiredBody' : 'stockScreen.expiringBody',
                        {
                          date: dateFmt.format(topBatch.expiryDate),
                          qty: formatQty(topBatch.qtyRemaining),
                          unit: topBatch.unit,
                        },
                      )}
                      {expiringBatches.length > 1 &&
                        ` · ${t('stockScreen.expiringMore', { count: expiringBatches.length - 1 })}`}
                    </AlertBanner>
                  )}

                  <Card withBorder padding="md" aria-label={t('stockScreen.itemsLabel')}>
                    <Stack gap="md">
                      <Group gap="xs">
                        <Select
                          placeholder={t('stockScreen.allBranches')}
                          aria-label={t('stockScreen.allBranches')}
                          data={branchOptions}
                          value={branchId}
                          onChange={(v) => {
                            setBranchId(v);
                            setSelectedId(null);
                          }}
                          clearable
                          w={220}
                        />
                        <Button
                          variant={criticalFirst ? 'primary' : 'default'}
                          onClick={() => setCriticalFirst((v) => !v)}
                        >
                          {t('stockScreen.sortCritical')}
                        </Button>
                        {category !== null && (
                          <Button onClick={() => setCategory(null)}>
                            {t('stockScreen.allCategories')}
                          </Button>
                        )}
                        {categories
                          .filter((c) => c !== category)
                          .map((c) => (
                            <Button key={c} onClick={() => setCategory(c)}>
                              {c}
                            </Button>
                          ))}
                      </Group>

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
                          items={visibleItems}
                          servicesByItem={usedIn}
                          selectedId={selectedId}
                          onSelect={setSelectedId}
                          canManage={canManage}
                          onMovement={handleMovement}
                          onReceive={(item) => handleReceive(item.id)}
                        />
                      )}
                    </Stack>
                  </Card>
                </Stack>
              </Grid.Col>

              <Grid.Col span={{ base: 12, lg: 4 }}>
                <Stack gap="md">
                  <Card withBorder padding="md">
                    <AutoDeductionLog rows={autoToday.data ?? []} />
                  </Card>
                  <Card withBorder padding="md">
                    <MovementHistory
                      itemName={selectedItem?.name ?? null}
                      movements={movements.data ?? []}
                    />
                  </Card>
                </Stack>
              </Grid.Col>
            </Grid>
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
      <BatchFormModal
        opened={batchOpened}
        onClose={closeBatch}
        items={itemVMs}
        defaultItemId={receiveItemId}
      />
    </>
  );
}
