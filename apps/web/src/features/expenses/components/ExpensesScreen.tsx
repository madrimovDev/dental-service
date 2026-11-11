import { PageHead, StatCard, StateView } from '@dental/ui';
import {
  Button,
  Group,
  Modal,
  Pagination,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconCategory, IconListNumbers, IconPlus, IconWallet } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatCurrency, formatNumber } from '@/lib/format';
import { useAuthStore } from '@/stores/auth-store.ts';
import {
  useBranches,
  useDeleteExpense,
  useExpenseCategories,
  useExpenseSummary,
  useExpenses,
  usePnl,
} from '../expenses.api';
import { buildCategoryNameMap, toExpenseVMs, toSummaryRows } from '../expenses.mappers';
import type { ExpenseVM } from '../expenses.types';
import { CategoryManagerModal } from './CategoryManagerModal';
import { ExpenseFormModal } from './ExpenseFormModal';
import { ExpenseSummaryCard } from './ExpenseSummaryCard';
import { ExpensesTable } from './ExpensesTable';
import { PnlPanel } from './PnlPanel';

const PAGE_SIZE = 20;

/** Joriy oyning birinchi/oxirgi kuni (ISO yyyy-mm-dd, lokal). */
function currentMonthRange(): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const pad = (n: number) => String(n).padStart(2, '0');
  const last = new Date(y, m + 1, 0).getDate();
  return { from: `${y}-${pad(m + 1)}-01`, to: `${y}-${pad(m + 1)}-${pad(last)}` };
}

export function ExpensesScreen() {
  const { t, i18n } = useTranslation();
  const { hasPermission } = useAuthStore();
  const canManage = hasPermission('expense.manage');
  const locale = i18n.language === 'ru' ? 'ru' : 'uz';
  const uncategorized = t('expenses.uncategorized');

  const defaultRange = useMemo(() => currentMonthRange(), []);
  const [from, setFrom] = useState(defaultRange.from);
  const [to, setTo] = useState(defaultRange.to);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [branchId, setBranchId] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  // FU-42: filtr o'zgarsa 1-sahifaga qaytamiz (aks holda bo'sh sahifa chiqishi mumkin).
  const changeFilter =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPage(1);
    };

  const [pendingDelete, setPendingDelete] = useState<ExpenseVM | null>(null);
  const [formOpened, { open: openForm, close: closeForm }] = useDisclosure(false);
  const [catOpened, { open: openCat, close: closeCat }] = useDisclosure(false);

  const categories = useExpenseCategories();
  const branches = useBranches();
  const expenses = useExpenses({
    from,
    to,
    categoryId: categoryId ?? undefined,
    branchId: branchId ?? undefined,
    page,
    pageSize: PAGE_SIZE,
  });
  const summary = useExpenseSummary({ from, to, branchId: branchId ?? undefined });
  const pnl = usePnl({ from, to, branchId: branchId ?? undefined });
  const deleteExpense = useDeleteExpense();

  const catList = useMemo(() => categories.data ?? [], [categories.data]);
  const branchList = useMemo(() => branches.data ?? [], [branches.data]);

  const nameMap = useMemo(() => buildCategoryNameMap(catList, locale), [catList, locale]);

  const expenseVMs = useMemo(
    () => toExpenseVMs(expenses.data?.data ?? [], nameMap, uncategorized),
    [expenses.data, nameMap, uncategorized],
  );

  const totalPages = Math.max(
    1,
    Math.ceil((expenses.data?.meta.total ?? 0) / (expenses.data?.meta.pageSize ?? PAGE_SIZE)),
  );

  const summaryRows = useMemo(
    () => (summary.data ? toSummaryRows(summary.data, nameMap, uncategorized) : []),
    [summary.data, nameMap, uncategorized],
  );

  // 3 KPI — mavjud summaryRows/DTO'dan client-side (yangi data YO'Q, delta YO'Q).
  const recordCount = useMemo(() => summaryRows.reduce((s, r) => s + r.count, 0), [summaryRows]);
  const categoryCount = summaryRows.length;

  const categoryOptions = catList.map((c) => ({
    value: c.id,
    label: locale === 'ru' && c.nameRu ? c.nameRu : c.name,
  }));
  const branchOptions = branchList.map((b) => ({ value: b.id, label: b.name }));

  const confirmDelete = () => {
    if (pendingDelete) deleteExpense.mutate(pendingDelete.id);
    setPendingDelete(null);
  };

  return (
    <>
      <Stack gap="lg">
        <PageHead
          title={t('expenses.title')}
          actions={
            canManage && (
              <Group>
                <Button
                  variant="default"
                  leftSection={<IconCategory size={18} />}
                  onClick={openCat}
                >
                  {t('expenses.categories')}
                </Button>
                <Button leftSection={<IconPlus size={18} />} onClick={openForm}>
                  {t('expenses.create')}
                </Button>
              </Group>
            )
          }
        />

        {pnl.data && <PnlPanel pnl={pnl.data} />}

        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="lg">
          <StatCard
            label={t('expenses.grand_total')}
            value={summary.data ? formatCurrency(summary.data.grandTotal, t) : '—'}
            icon={<IconWallet />}
            accent
          />
          <StatCard
            label={t('expenses.count')}
            value={summary.data ? formatNumber(recordCount) : '—'}
            icon={<IconListNumbers />}
          />
          <StatCard
            label={t('expenses.categories')}
            value={summary.data ? formatNumber(categoryCount) : '—'}
            icon={<IconCategory />}
          />
        </SimpleGrid>

        <Group align="flex-end">
          <TextInput
            type="date"
            label={t('expenses.from')}
            value={from}
            onChange={(e) => changeFilter(setFrom)(e.currentTarget.value)}
          />
          <TextInput
            type="date"
            label={t('expenses.to')}
            value={to}
            onChange={(e) => changeFilter(setTo)(e.currentTarget.value)}
          />
          <Select
            label={t('expenses.category')}
            placeholder={t('expenses.all_categories')}
            data={categoryOptions}
            value={categoryId}
            onChange={changeFilter(setCategoryId)}
            clearable
            w={200}
          />
          <Select
            label={t('expenses.branch')}
            placeholder={t('expenses.all_branches')}
            data={branchOptions}
            value={branchId}
            onChange={changeFilter(setBranchId)}
            clearable
            w={200}
          />
        </Group>

        <ExpenseSummaryCard rows={summaryRows} grandTotal={summary.data?.grandTotal ?? 0} />
        <Text size="xs" c="dimmed">
          {t('finance.stockNote')}
        </Text>

        {expenses.isError ? (
          <StateView
            status="error"
            title={t('states.error_title')}
            retryLabel={t('states.retry')}
            onRetry={() => expenses.refetch()}
          />
        ) : expenses.isLoading ? (
          <StateView status="loading" skeleton="table" />
        ) : (
          <>
            <ExpensesTable
              expenses={expenseVMs}
              canManage={canManage}
              onDelete={setPendingDelete}
            />
            {totalPages > 1 && (
              <Group justify="flex-end">
                <Pagination value={page} onChange={setPage} total={totalPages} />
              </Group>
            )}
          </>
        )}
      </Stack>

      <ExpenseFormModal
        opened={formOpened}
        onClose={closeForm}
        categories={catList}
        branches={branchList}
      />
      <CategoryManagerModal opened={catOpened} onClose={closeCat} categories={catList} />

      <Modal
        opened={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        title={t('expenses.confirm_delete')}
        size="sm"
      >
        <Stack gap="md">
          <Text size="sm">
            {pendingDelete?.categoryName} —{' '}
            {pendingDelete ? formatCurrency(pendingDelete.amount, t) : ''}
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setPendingDelete(null)}>
              {t('common.cancel')}
            </Button>
            <Button color="red" loading={deleteExpense.isPending} onClick={confirmDelete}>
              {t('common.delete')}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
