import type { Service } from '@dental/api-client';
import { PageHead, StateView } from '@dental/ui';
import { Button, Container, Group, Modal, Select, Stack, Text, TextInput } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconPlus, IconSearch } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/auth-store.ts';
import { useDeleteService, useServices } from '../services.api';
import { filterServices, groupByCategory } from '../services.mappers';
import type { ServiceVM } from '../services.types';
import { ServiceFormModal } from './ServiceFormModal';
import classes from './ServicesScreen.module.css';
import { ServicesTable } from './ServicesTable';

export function ServicesScreen() {
  const { t } = useTranslation();
  const { hasPermission } = useAuthStore();
  const canManage = hasPermission('service.manage');

  const services = useServices();
  const deleteService = useDeleteService();

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [editing, setEditing] = useState<Service | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ServiceVM | null>(null);
  const [formOpened, { open: openForm, close: closeForm }] = useDisclosure(false);

  const list = useMemo(() => services.data ?? [], [services.data]);

  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    for (const s of list) if (s.category) set.add(s.category);
    return [...set].sort((a, b) => a.localeCompare(b)).map((c) => ({ value: c, label: c }));
  }, [list]);

  const groups = useMemo(
    () => groupByCategory(filterServices(list, search, category)),
    [list, search, category],
  );

  const openCreate = () => {
    setEditing(null);
    openForm();
  };
  const openEdit = (id: string) => {
    setEditing(list.find((s) => s.id === id) ?? null);
    openForm();
  };
  const handleFormClose = () => {
    setEditing(null);
    closeForm();
  };
  const confirmDelete = () => {
    if (pendingDelete) deleteService.mutate(pendingDelete.id);
    setPendingDelete(null);
  };

  return (
    <Container size="xl">
      <Stack gap="lg">
        <PageHead
          title={t('services.title')}
          actions={
            canManage && (
              <Button leftSection={<IconPlus size={18} />} onClick={openCreate}>
                {t('services.create')}
              </Button>
            )
          }
        />

        <div className={classes.toolbar}>
          <TextInput
            className={classes.searchField}
            leftSection={<IconSearch size={16} />}
            placeholder={t('services.search')}
            aria-label={t('services.search')}
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
          />
          <Select
            placeholder={t('services.category')}
            aria-label={t('services.category')}
            data={categoryOptions}
            value={category}
            onChange={setCategory}
            clearable
            w={220}
          />
        </div>

        {services.isLoading ? (
          <StateView status="loading" skeleton="table" />
        ) : services.isError ? (
          <StateView
            status="error"
            title={t('states.error_title')}
            retryLabel={t('states.retry')}
            onRetry={() => services.refetch()}
          />
        ) : list.length === 0 ? (
          <StateView
            status="empty"
            title={t('states.empty_title')}
            description={t('services.empty')}
          />
        ) : (
          <ServicesTable
            groups={groups}
            canManage={canManage}
            onEdit={openEdit}
            onDelete={setPendingDelete}
          />
        )}
      </Stack>

      <ServiceFormModal opened={formOpened} onClose={handleFormClose} editing={editing} />

      <Modal
        opened={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        title={t('services.confirm_delete')}
        size="sm"
      >
        <Stack gap="md">
          <Text size="sm">
            {pendingDelete?.nameUz} ({pendingDelete?.code})
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setPendingDelete(null)}>
              {t('common.cancel')}
            </Button>
            <Button color="red" loading={deleteService.isPending} onClick={confirmDelete}>
              {t('common.delete')}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Container>
  );
}
