import { Card, Mono } from '@dental/ui';
import { ActionIcon, Badge, Group, Table, Text } from '@mantine/core';
import { IconEdit, IconTrash } from '@tabler/icons-react';
import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import type { CategoryGroup, ServiceVM } from '../services.types';
import classes from './ServicesTable.module.css';

export function ServicesTable({
  groups,
  canManage,
  onEdit,
  onDelete,
}: {
  groups: CategoryGroup[];
  canManage: boolean;
  onEdit: (id: string) => void;
  onDelete: (vm: ServiceVM) => void;
}) {
  const { t } = useTranslation();

  return (
    <Card bodyless>
      <Table.ScrollContainer minWidth={700}>
        <Table verticalSpacing="sm" highlightOnHover>
          <Table.Thead>
            <Table.Tr className={classes.headRow}>
              <Table.Th>{t('services.code')}</Table.Th>
              <Table.Th>{t('services.name')}</Table.Th>
              <Table.Th>{t('services.duration')}</Table.Th>
              <Table.Th>{t('services.status')}</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {groups.map((group) => (
              <Fragment key={group.category ?? '__none__'}>
                <Table.Tr className={classes.groupRow}>
                  <Table.Td colSpan={5}>
                    <Text component="span" className={classes.groupLabel}>
                      {group.category ?? t('services.other')}
                    </Text>
                  </Table.Td>
                </Table.Tr>
                {group.services.map((s) => (
                  <Table.Tr key={s.id}>
                    <Table.Td>
                      <Mono>{s.code}</Mono>
                    </Table.Td>
                    <Table.Td>
                      <Text component="span" className={classes.name}>
                        {s.nameUz}
                      </Text>
                      {s.nameRu && (
                        <Text component="div" className={classes.sub}>
                          {s.nameRu}
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Text component="span" className={classes.duration}>
                        {s.durationMinutes} {t('services.minutes')}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Badge color={s.isActive ? 'teal' : 'gray'}>
                        {s.isActive ? t('common.active') : t('common.inactive')}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      {canManage && (
                        <Group gap="xs" justify="flex-end">
                          <ActionIcon
                            variant="subtle"
                            onClick={() => onEdit(s.id)}
                            aria-label={t('services.edit')}
                          >
                            <IconEdit size={16} />
                          </ActionIcon>
                          <ActionIcon
                            variant="subtle"
                            color="red"
                            className={classes.remove}
                            onClick={() => onDelete(s)}
                            aria-label={t('common.delete')}
                          >
                            <IconTrash size={16} />
                          </ActionIcon>
                        </Group>
                      )}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Fragment>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </Card>
  );
}
