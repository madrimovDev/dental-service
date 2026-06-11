import { PageHead } from '@dental/ui';
import { Button, Card, Container, Grid, Group, Select, Stack, Tabs } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconBox, IconList, IconPlus } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/auth-store.ts';
import { useBranches, useServices, useStockItems, useStockMovements } from '../stock.api';
import { toStockItemVM } from '../stock.mappers';
import type { StockItemVM } from '../stock.types';
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

  const branches = useBranches();
  const services = useServices();
  const items = useStockItems(branchId ?? undefined);
  const movements = useStockMovements(selectedId);

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
    <Container size="xl">
      <Stack gap="lg">
        <PageHead
          title={t('stock.title')}
          actions={
            canManage && (
              <Button leftSection={<IconPlus size={18} />} onClick={openItemForm}>
                {t('stock.create_item')}
              </Button>
            )
          }
        />

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
                    <StockItemsTable
                      items={itemVMs}
                      selectedId={selectedId}
                      onSelect={setSelectedId}
                      canManage={canManage}
                      onMovement={handleMovement}
                    />
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
    </Container>
  );
}
