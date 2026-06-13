import type { PaymentMethod } from '@dental/api-client';
import { StatusPill } from '@dental/ui';
import {
  Button,
  Card,
  Checkbox,
  Group,
  NumberInput,
  Select,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { IconCash } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCreateTransaction, usePatientPlans, usePlanBalance } from '../cashier.api';
import { buildAllocationPayload, toPlanBalanceVM } from '../cashier.mappers';
import type { StageState } from '../cashier.types';

const formatUZS = (n: number) => `${new Intl.NumberFormat('uz-UZ').format(n)} so'm`;

const STATE_TONE: Record<StageState, 'success' | 'warning' | 'danger'> = {
  paid: 'success',
  partial: 'warning',
  unpaid: 'danger',
};

export interface PlanBillingPanelProps {
  branchId: string;
  patientId: string | null;
}

type Selection = { checked: boolean; amount: number };

export function PlanBillingPanel({ branchId, patientId }: PlanBillingPanelProps) {
  const { t } = useTranslation();
  const plansQuery = usePatientPlans(patientId);
  const [planId, setPlanId] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [selections, setSelections] = useState<Record<string, Selection>>({});

  const balanceQuery = usePlanBalance(planId);
  const createMut = useCreateTransaction();

  const plans = plansQuery.data ?? [];

  // Bemor o'zgarganda planni tozalash.
  // biome-ignore lint/correctness/useExhaustiveDependencies: faqat patientId o'zgarishiga reaksiya (reset)
  useEffect(() => {
    setPlanId(null);
    setSelections({});
  }, [patientId]);

  // Bitta plan bo'lsa avtomatik tanlash.
  useEffect(() => {
    if (planId === null && plans.length === 1) {
      setPlanId(plans[0]?.id ?? null);
    }
  }, [plans, planId]);

  const balanceVM = balanceQuery.data ? toPlanBalanceVM(balanceQuery.data) : null;

  const toggleStage = (stageId: string, remaining: number) => {
    setSelections((prev) => {
      const cur = prev[stageId];
      if (cur?.checked) {
        const next = { ...prev };
        delete next[stageId];
        return next;
      }
      return { ...prev, [stageId]: { checked: true, amount: remaining } };
    });
  };

  const setAmount = (stageId: string, amount: number) => {
    setSelections((prev) => ({ ...prev, [stageId]: { checked: true, amount } }));
  };

  const activeSelections = Object.entries(selections)
    .filter(([, s]) => s.checked && s.amount > 0)
    .map(([stageId, s]) => ({ stageId, amount: s.amount }));

  const handlePay = () => {
    if (!planId || activeSelections.length === 0) return;
    const payload = buildAllocationPayload({
      branchId,
      patientId,
      treatmentPlanId: planId,
      selections: activeSelections,
      paymentMethod,
    });
    createMut.mutate(payload, {
      onSuccess: () => setSelections({}),
    });
  };

  if (!patientId) {
    return (
      <Card withBorder padding="lg" radius="md">
        <Text c="dimmed">{t('cashier.plan_billing.select_patient_first')}</Text>
      </Card>
    );
  }

  return (
    <Card withBorder padding="lg" radius="md">
      <Stack gap="md">
        <Title order={4}>{t('cashier.mode.plan')}</Title>

        {plansQuery.isError ? (
          <Text c="red">{t('cashier.plan_billing.load_error')}</Text>
        ) : plans.length === 0 ? (
          <Text c="dimmed">{t('cashier.plan_billing.no_plans')}</Text>
        ) : (
          <Select
            label={t('cashier.plan_billing.select_plan')}
            data={plans.map((p) => ({ value: p.id, label: p.title }))}
            value={planId}
            onChange={(v) => {
              setPlanId(v);
              setSelections({});
            }}
            clearable
          />
        )}

        {balanceVM && (
          <>
            <Table verticalSpacing="xs">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th />
                  <Table.Th>{t('cashier.plan_billing.stage')}</Table.Th>
                  <Table.Th>{t('cashier.plan_billing.cost')}</Table.Th>
                  <Table.Th>{t('cashier.plan_billing.remaining')}</Table.Th>
                  <Table.Th>{t('cashier.status')}</Table.Th>
                  <Table.Th>{t('cashier.amount')}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {balanceVM.stages.map((s) => {
                  const sel = selections[s.stageId];
                  const disabled = s.state === 'paid';
                  return (
                    <Table.Tr key={s.stageId}>
                      <Table.Td>
                        <Checkbox
                          aria-label={s.serviceName}
                          checked={!!sel?.checked}
                          disabled={disabled}
                          onChange={() => toggleStage(s.stageId, s.remaining)}
                        />
                      </Table.Td>
                      <Table.Td>{s.serviceName}</Table.Td>
                      <Table.Td>{formatUZS(s.cost)}</Table.Td>
                      <Table.Td>{formatUZS(s.remaining)}</Table.Td>
                      <Table.Td>
                        <StatusPill status={STATE_TONE[s.state]}>
                          {t(`cashier.plan_billing.state.${s.state}`)}
                        </StatusPill>
                      </Table.Td>
                      <Table.Td>
                        {sel?.checked && (
                          <NumberInput
                            aria-label={`${s.serviceName} ${t('cashier.amount')}`}
                            value={sel.amount}
                            onChange={(v) => setAmount(s.stageId, typeof v === 'number' ? v : 0)}
                            min={0}
                            max={s.remaining}
                            step={1000}
                            w={130}
                            size="xs"
                            thousandSeparator=" "
                          />
                        )}
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>

            <Group justify="space-between">
              <Text size="sm" c="dimmed">
                {t('cashier.plan_billing.balance')}: {formatUZS(balanceVM.balance)}
              </Text>
            </Group>

            <Group grow>
              <Select
                label={t('cashier.payment_method')}
                data={[
                  { value: 'cash', label: t('cashier.method.cash') },
                  { value: 'card', label: t('cashier.method.card') },
                  { value: 'transfer', label: t('cashier.method.transfer') },
                  { value: 'other', label: t('cashier.method.other') },
                ]}
                value={paymentMethod}
                onChange={(v) => setPaymentMethod((v ?? 'cash') as PaymentMethod)}
              />
            </Group>

            <Button
              leftSection={<IconCash size={18} />}
              color="teal"
              disabled={activeSelections.length === 0}
              loading={createMut.isPending}
              onClick={handlePay}
            >
              {t('cashier.plan_billing.pay_selected')}
            </Button>
          </>
        )}
      </Stack>
    </Card>
  );
}
