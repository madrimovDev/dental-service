import { PageHead } from '@dental/ui';
import {
  Container,
  Group,
  Paper,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
} from '@mantine/core';
import { useState } from 'react';
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

        <Group align="flex-end">
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
            onChange={(v) => setMode(v as CashierMode)}
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
              <PosPanel branchId={branchId} patientId={patientId} />
            ) : (
              <PlanBillingPanel branchId={branchId} patientId={patientId} />
            ))}

          {/* RIGHT: kunlik xulosa + tranzaksiyalar */}
          <Stack gap="md">
            {summaryQuery.data && <DailySummaryCard summary={summaryQuery.data} />}
            <Paper withBorder p="lg" radius="md">
              <TransactionsTable transactions={txQuery.data?.data ?? []} />
            </Paper>
          </Stack>
        </SimpleGrid>
      </Stack>
    </Container>
  );
}
