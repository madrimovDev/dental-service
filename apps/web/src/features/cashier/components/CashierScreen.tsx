import { PageHead, StateView } from '@dental/ui';
import { Box, Flex, Group, Paper, SegmentedControl, Select, Stack } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
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
  // CLI-454: bemor Select avval pageSize:100 bilan qidiruvsiz cheklangan edi — 100 tadan
  // ortiq bemorli tenant'da kerakli bemor ko'rinmasdi. Endi qidiruv matni debounced
  // holda serverga uzatiladi (backend `ilike` filtri).
  const [patientSearch, setPatientSearch] = useState('');
  const [debouncedPatientSearch] = useDebouncedValue(patientSearch, 300);
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
  const patientsQuery = usePatientsAll(debouncedPatientSearch);
  const txQuery = useTodayTransactions(branchId);
  const summaryQuery = useDailySummary(branchId);

  const canCreate = hasPermission('cashier.create_transaction');

  return (
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

      <Group align="flex-end" gap="md" wrap="wrap">
        <Select
          label={t('cashier.patient')}
          placeholder={t('cashier.select_patient')}
          data={patientsQuery.data?.data.map((p) => ({ value: p.id, label: p.fullName })) ?? []}
          value={patientId}
          onChange={setPatientId}
          searchable
          clearable
          searchValue={patientSearch}
          onSearchChange={setPatientSearch}
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

      {/* Dental OS 2-ustun layout: chap = POS/plan (1fr), o'ng = 360px stacked. */}
      <Flex direction={{ base: 'column', lg: 'row' }} gap={16} align="flex-start">
        {/* LEFT: POS yoki plan billing — minmax(0,1fr) ekvivalenti (miw=0). */}
        <Box flex={1} miw={0} w={{ base: '100%', lg: 'auto' }}>
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
        </Box>

        {/* RIGHT (360px): kunlik xulosa + tranzaksiyalar */}
        <Box w={{ base: '100%', lg: 360 }} style={{ flexShrink: 0 }}>
          <Stack gap="md">
            {summaryQuery.data && <DailySummaryCard summary={summaryQuery.data} />}
            <Paper
              p={0}
              radius="var(--radius-card)"
              style={{
                border: '1px solid var(--border)',
                boxShadow: 'var(--shadow-sm)',
                overflow: 'hidden',
                fontFamily: 'var(--font-sans)',
              }}
            >
              <Box p="18px">
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
              </Box>
            </Paper>
          </Stack>
        </Box>
      </Flex>
    </Stack>
  );
}
