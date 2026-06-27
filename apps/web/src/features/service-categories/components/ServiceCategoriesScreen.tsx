import type { ServiceCategory } from '@dental/api-client';
import { PageHead, StateView } from '@dental/ui';
import { ActionIcon, Button, Group, Modal, Stack, Table, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconPencil, IconPlus, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/auth-store.ts';
import { useDeleteServiceCategory, useServiceCategories } from '../service-categories.api';
import { ServiceCategoryFormModal } from './ServiceCategoryFormModal';

export function ServiceCategoriesScreen() {
  const { t } = useTranslation();
  const { hasPermission } = useAuthStore();
  const canManage = hasPermission('service.manage');

  const categories = useServiceCategories();
  const del = useDeleteServiceCategory();
  const [editing, setEditing] = useState<ServiceCategory | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ServiceCategory | null>(null);
  const [opened, { open, close }] = useDisclosure(false);

  const list = categories.data ?? [];
  const openCreate = () => {
    setEditing(null);
    open();
  };
  const openEdit = (cat: ServiceCategory) => {
    setEditing(cat);
    open();
  };

  return (
    <>
      <Stack gap="lg">
        <PageHead
          title={t('serviceCategories.title')}
          actions={
            canManage && (
              <Button leftSection={<IconPlus size={18} />} onClick={openCreate}>
                {t('serviceCategories.create')}
              </Button>
            )
          }
        />
        {categories.isLoading ? (
          <StateView status="loading" skeleton="table" />
        ) : categories.isError ? (
          <StateView
            status="error"
            title={t('states.error_title')}
            retryLabel={t('states.retry')}
            onRetry={() => categories.refetch()}
          />
        ) : list.length === 0 ? (
          <StateView
            status="empty"
            title={t('states.empty_title')}
            description={t('serviceCategories.empty')}
          />
        ) : (
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t('serviceCategories.name')}</Table.Th>
                <Table.Th>{t('serviceCategories.name_ru')}</Table.Th>
                {canManage && <Table.Th />}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {list.map((cat) => (
                <Table.Tr key={cat.id}>
                  <Table.Td>{cat.name}</Table.Td>
                  <Table.Td>{cat.nameRu ?? '—'}</Table.Td>
                  {canManage && (
                    <Table.Td>
                      <Group gap="xs" justify="flex-end">
                        <ActionIcon
                          variant="subtle"
                          aria-label={t('common.edit')}
                          onClick={() => openEdit(cat)}
                        >
                          <IconPencil size={16} />
                        </ActionIcon>
                        <ActionIcon
                          variant="subtle"
                          color="red"
                          aria-label={t('common.delete')}
                          onClick={() => setPendingDelete(cat)}
                        >
                          <IconTrash size={16} />
                        </ActionIcon>
                      </Group>
                    </Table.Td>
                  )}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Stack>

      <ServiceCategoryFormModal
        opened={opened}
        onClose={() => {
          setEditing(null);
          close();
        }}
        editing={editing}
      />

      <Modal
        opened={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        title={t('serviceCategories.confirm_delete')}
        size="sm"
      >
        <Stack gap="md">
          <Text size="sm">{pendingDelete?.name}</Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setPendingDelete(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              color="red"
              loading={del.isPending}
              onClick={() => {
                if (pendingDelete)
                  del.mutate(pendingDelete.id, { onSuccess: () => setPendingDelete(null) });
              }}
            >
              {t('common.delete')}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
