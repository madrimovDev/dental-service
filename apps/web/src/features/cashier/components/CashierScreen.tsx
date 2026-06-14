import { PageHead, StateView } from '@dental/ui';
import {
  Container,
  Group,
  Paper,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
} from '@mantine/core';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/auth-store.ts';
import { useBranches, useDailySummary, usePatientsAll, useTodayTransactions } from '../cashier.api';
import type { CashierMode } from '../cashier.types';
import { DailySummaryCard } from './DailySummaryCard';
import { PlanBillingPanel } from './PlanBillingPanel';
import { PosPanel } from './PosPanel';
import { TransactionsTable } from './TransactionsTable';

export function CashierScreen() {
  const { t } = useTranslation();
  const { hasPermission, activeBranchId } = useAuthStore();

  const [branchId, setBranchId] = useState<string | null>(activeBranchId);
  const [patientId, setPatientId] = useState<string | null>(null);
  const [mode, setMode] = useState<CashierMode>('payment');
  // POS savatida to'ldirilmagan satr borligini kuzatadi (rejim almashganda yo'qotishni ogohlantirish).
  const posCartDirty = useRef(false);

  const handleModeChange = useCallback(
    (v: string) => {
      const next = v as CashierMode;
      // Faqat to'lov rejimidan chiqayotganda va savat bo'sh emas bo'lsa ogohlantiramiz.
      if (next !== 'payment' && posCartDirty.current) {
        if (!window.confirm(t('cashier.switch_mode_confirm'))) return;
      }
      setMode(next);
    },
    [t],
  );

  const handlePosDirtyChange = useCallback((dirty: boolean) => {
    posCartDirty.current = dirty;
  }, []);

  const branchesQuery = useBranches();
  const patientsQuery = usePatientsAll();
  const txQuery = useTodayTransactions(branchId);
  const summaryQuery = useDailySummary(branchId);

  const canCreate = hasPermission('cashier.create_transaction');

  return (
    <Container size="xl">
      <Stack gap="lg">
        <PageHead
          title={t('cashier.title')}
          actions={
            <Select
              label={t('cashier.branch')}
              data={branchesQuery.data?.map((b) => ({ value: b.id, label: b.name })) ?? []}
              value={branchId}
              onChange={setBranchId}
              w={220}
            />
          }
        />

        <Group align="flex-end" wrap="wrap">
          <Select
            label={t('cashier.patient')}
            placeholder={t('cashier.select_patient')}
            data={patientsQuery.data?.data.map((p) => ({ value: p.id, label: p.fullName })) ?? []}
            value={patientId}
            onChange={setPatientId}
            searchable
            clearable
            w={280}
          />
          <SegmentedControl
            value={mode}
            onChange={handleModeChange}
            data={[
              { value: 'payment', label: t('cashier.mode.payment') },
              { value: 'plan', label: t('cashier.mode.plan') },
            ]}
          />
        </Group>

        <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg">
          {/* LEFT: POS yoki plan billing */}
          {canCreate &&
            branchId &&
            (mode === 'payment' ? (
              <PosPanel
                branchId={branchId}
                patientId={patientId}
                onDirtyChange={handlePosDirtyChange}
              />
            ) : (
              <PlanBillingPanel branchId={branchId} patientId={patientId} />
            ))}

          {/* RIGHT: kunlik xulosa + tranzaksiyalar */}
          <Stack gap="md">
            {summaryQuery.data && <DailySummaryCard summary={summaryQuery.data} />}
            <Paper withBorder p="lg" radius="md">
              {txQuery.isLoading ? (
                <StateView status="loading" skeleton="table" />
              ) : txQuery.isError ? (
                <StateView
                  status="error"
                  title={t('states.error_title')}
                  retryLabel={t('states.retry')}
                  onRetry={() => txQuery.refetch()}
                />
              ) : (
                <TransactionsTable transactions={txQuery.data?.data ?? []} />
              )}
            </Paper>
          </Stack>
        </SimpleGrid>
      </Stack>
    </Container>
  );
}
