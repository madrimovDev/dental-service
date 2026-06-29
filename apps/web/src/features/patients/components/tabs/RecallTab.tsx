import { Card, StatusPill } from '@dental/ui';
import {
  Button,
  Group,
  NumberInput,
  Paper,
  Select,
  Stack,
  Table,
  Text,
  Textarea,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useForm } from '@mantine/form';
import { IconPlus } from '@tabler/icons-react';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { useTranslation } from 'react-i18next';
import { useCreateRecall, usePatientRecalls } from '@/features/recalls/recalls.api.ts';
import { recallReasonLabelKey, recallStatusLabelKey } from '@/features/recalls/recalls.mappers.ts';
import { createRecallSchema } from '@/features/recalls/recalls.schema.ts';
import type { RecallDto } from '@/features/recalls/recalls.types.ts';
import { useAuthStore } from '@/stores/auth-store.ts';

function statusTone(status: RecallDto['status']): 'neutral' | 'warning' | 'success' | 'info' {
  switch (status) {
    case 'contacted':
      return 'info';
    case 'scheduled':
      return 'success';
    case 'pending':
      return 'warning';
    default:
      return 'neutral';
  }
}

/** 'YYYY-MM-DD' (klinika-local) — DateInput Date'idan. */
function toDueDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function CreateRecallForm({ patientId }: { patientId: string }) {
  const { t } = useTranslation();
  const createMut = useCreateRecall();

  const form = useForm({
    initialValues: {
      reason: 'manual' as const,
      dueDate: null as Date | null,
      intervalMonths: null as number | null,
      notes: '',
    },
    validate: zod4Resolver(createRecallSchema),
  });

  const reasonOptions = (
    ['preventive', 'treatment_followup', 'post_op_check', 'manual'] as const
  ).map((r) => ({ value: r, label: t(recallReasonLabelKey(r)) }));

  const submit = form.onSubmit((values) => {
    if (!values.dueDate) return;
    createMut.mutate(
      {
        patientId,
        reason: values.reason,
        dueDate: toDueDate(values.dueDate),
        intervalMonths: values.intervalMonths ?? undefined,
        notes: values.notes || undefined,
      },
      { onSuccess: () => form.reset() },
    );
  });

  return (
    <Card title={t('recall.tab.create')}>
      <form onSubmit={submit}>
        <Stack gap="md">
          <Select
            label={t('recall.form.reason')}
            data={reasonOptions}
            allowDeselect={false}
            value={form.values.reason}
            error={form.errors.reason}
            onChange={(v) => v && form.setFieldValue('reason', v as typeof form.values.reason)}
          />
          <DateInput
            label={t('recall.form.due_date')}
            valueFormat="DD.MM.YYYY"
            clearable
            value={form.values.dueDate}
            error={form.errors.dueDate}
            onChange={(d) => form.setFieldValue('dueDate', d)}
          />
          <NumberInput
            label={t('recall.form.interval_months')}
            min={1}
            max={120}
            value={form.values.intervalMonths ?? ''}
            error={form.errors.intervalMonths}
            onChange={(v) => form.setFieldValue('intervalMonths', v === '' ? null : Number(v))}
          />
          <Textarea
            label={t('recall.form.notes')}
            autosize
            minRows={2}
            maxRows={4}
            value={form.values.notes}
            error={form.errors.notes}
            onChange={(e) => form.setFieldValue('notes', e.currentTarget.value)}
          />
          <Group justify="flex-end">
            <Button
              type="submit"
              leftSection={<IconPlus size={16} />}
              loading={createMut.isPending}
            >
              {t('recall.form.submit')}
            </Button>
          </Group>
        </Stack>
      </form>
    </Card>
  );
}

export function RecallTab({ patientId }: { patientId: string }) {
  const { t } = useTranslation();
  const { hasPermission } = useAuthStore();
  const canManage = hasPermission('recall.manage');
  const query = usePatientRecalls(patientId);

  const rows = query.data ?? [];

  return (
    <Stack gap="md">
      <Paper withBorder p="md" radius="var(--radius-card)">
        {query.isLoading ? (
          <Text>{t('common.loading')}</Text>
        ) : rows.length === 0 ? (
          <Text c="dimmed">{t('recall.tab.empty')}</Text>
        ) : (
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t('recall.col.reason')}</Table.Th>
                <Table.Th>{t('recall.col.due')}</Table.Th>
                <Table.Th>{t('recall.col.status')}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((r) => (
                <Table.Tr key={r.id}>
                  <Table.Td>{t(recallReasonLabelKey(r.reason))}</Table.Td>
                  <Table.Td>{r.dueDate}</Table.Td>
                  <Table.Td>
                    <StatusPill status={statusTone(r.status)}>
                      {t(recallStatusLabelKey(r.status))}
                    </StatusPill>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Paper>

      {canManage && <CreateRecallForm patientId={patientId} />}
    </Stack>
  );
}
