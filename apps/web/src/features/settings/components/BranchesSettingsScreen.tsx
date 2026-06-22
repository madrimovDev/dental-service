import type { Branch } from '@dental/api-client';
import { StatusPill } from '@dental/ui';
import { ActionIcon, Button, Group, Modal, Stack, Text, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useDisclosure } from '@mantine/hooks';
import { IconEdit, IconPlus, IconTrash } from '@tabler/icons-react';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PhoneInput } from '@/components/PhoneInput.tsx';
import { useAuthStore } from '@/stores/auth-store.ts';
import { useBranches, useDeleteBranch, useUpsertBranch, useUsers } from '../settings.api';
import { type BranchFormValues, branchSchema } from '../settings.schema';
import { ConfirmModal } from './ConfirmModal';
import { SettingsShell } from './SettingsShell';

const GRID_COLS = 'minmax(0,1fr) minmax(0,1.3fr) 150px 110px auto';

export function BranchesSettingsScreen() {
  const { t } = useTranslation();
  const { hasPermission } = useAuthStore();
  const branches = useBranches();
  const assignments = useUsers();
  const upsert = useUpsertBranch();
  const remove = useDeleteBranch();

  // Filial bo'yicha aktiv xodim soni (CLI-159) — assignment'lardan client-side hisoblanadi.
  // branchId=null ("barcha filiallar") biriktirilgan xodimlar har filialga tegishli sanaladi.
  const { perBranch, allBranchesCount } = useMemo(() => {
    const counts = new Map<string, number>();
    let allCount = 0;
    for (const a of assignments.data ?? []) {
      if (!a.isActive) continue;
      if (a.branchId) counts.set(a.branchId, (counts.get(a.branchId) ?? 0) + 1);
      else allCount += 1;
    }
    return { perBranch: counts, allBranchesCount: allCount };
  }, [assignments.data]);
  const [opened, { open, close }] = useDisclosure(false);
  const [editing, setEditing] = useState<Branch | null>(null);
  const [toDelete, setToDelete] = useState<Branch | null>(null);

  const form = useForm<BranchFormValues>({
    initialValues: { name: '', address: '', phone: '' },
    validate: zod4Resolver(branchSchema),
  });

  const openCreate = () => {
    setEditing(null);
    form.reset();
    open();
  };
  const openEdit = (b: Branch) => {
    setEditing(b);
    form.setValues({ name: b.name, address: b.address ?? '', phone: b.phone ?? '' });
    open();
  };

  const submit = (values: BranchFormValues) =>
    upsert.mutate(
      {
        id: editing?.id ?? null,
        name: values.name,
        address: values.address || undefined,
        phone: values.phone || undefined,
      },
      {
        onSuccess: () => {
          close();
          setEditing(null);
          form.reset();
        },
      },
    );

  return (
    <SettingsShell active="branches">
      <div
        style={{
          border: '1px solid var(--border)',
          borderRadius: 16,
          background: 'var(--surface)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '16px 18px',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <Text fw={700} style={{ fontSize: 16, color: 'var(--ink)' }}>
            {t('branches.title')}
          </Text>
          {hasPermission('branch.create') && (
            <Button leftSection={<IconPlus size={18} />} onClick={openCreate}>
              {t('branches.create')}
            </Button>
          )}
        </div>

        {branches.isLoading && <Text style={{ padding: '16px 18px' }}>{t('common.loading')}</Text>}
        {branches.data && branches.data.length === 0 && (
          <Text c="dimmed" style={{ padding: '16px 18px' }}>
            {t('branches.empty')}
          </Text>
        )}
        {branches.data && branches.data.length > 0 && (
          <div>
            {/* Header band */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: GRID_COLS,
                gap: 12,
                alignItems: 'center',
                padding: '10px 18px',
                background: 'var(--surface-2)',
                fontSize: 11,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                color: 'var(--ink-3)',
              }}
            >
              <span>{t('common.name')}</span>
              <span>{t('branches.address')}</span>
              <span>{t('branches.phone')}</span>
              <span style={{ textAlign: 'right' }}>{t('branches.staff_count')}</span>
              <span />
            </div>
            {branches.data.map((b) => {
              const count = (perBranch.get(b.id) ?? 0) + allBranchesCount;
              return (
                <div
                  key={b.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: GRID_COLS,
                    gap: 12,
                    alignItems: 'center',
                    padding: '14px 18px',
                    borderTop: '1px solid var(--border)',
                    fontSize: 13.5,
                    color: 'var(--ink)',
                  }}
                >
                  <span style={{ fontWeight: 600 }}>{b.name}</span>
                  <span style={{ color: 'var(--ink-2)' }}>{b.address ?? '—'}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-2)' }}>
                    {b.phone ?? '—'}
                  </span>
                  <span
                    style={{
                      textAlign: 'right',
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--ink-2)',
                    }}
                  >
                    {t('branches.staff_n', { n: count })}
                  </span>
                  <span
                    style={{
                      display: 'flex',
                      justifyContent: 'flex-end',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <StatusPill status={count > 0 ? 'success' : 'neutral'}>
                      {count > 0 ? t('common.active') : t('common.inactive')}
                    </StatusPill>
                    {hasPermission('branch.edit') && (
                      <ActionIcon
                        variant="subtle"
                        onClick={() => openEdit(b)}
                        aria-label={t('common.edit')}
                      >
                        <IconEdit size={16} />
                      </ActionIcon>
                    )}
                    {hasPermission('branch.delete') && (
                      <ActionIcon
                        variant="subtle"
                        color="red"
                        onClick={() => setToDelete(b)}
                        aria-label={t('common.delete')}
                      >
                        <IconTrash size={16} />
                      </ActionIcon>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Modal
        opened={opened}
        onClose={close}
        title={editing ? t('branches.edit') : t('branches.create')}
      >
        <form onSubmit={form.onSubmit(submit)}>
          <Stack gap="md">
            <TextInput label={t('branches.name')} required {...form.getInputProps('name')} />
            <TextInput label={t('branches.address')} {...form.getInputProps('address')} />
            <PhoneInput label={t('branches.phone')} {...form.getInputProps('phone')} />
            <Group justify="flex-end">
              <Button variant="default" onClick={close}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" loading={upsert.isPending}>
                {t('common.save')}
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      <ConfirmModal
        opened={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={() => {
          if (toDelete) remove.mutate(toDelete.id, { onSuccess: () => setToDelete(null) });
        }}
        message={t('branches.confirm_delete')}
        loading={remove.isPending}
      />
    </SettingsShell>
  );
}
