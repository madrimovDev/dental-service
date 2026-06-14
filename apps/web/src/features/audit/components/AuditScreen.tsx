import { Mono, PageHead, StateView } from '@dental/ui';
import {
  Button,
  Code,
  Container,
  Group,
  JsonInput,
  Modal,
  Pagination,
  Paper,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuditLog, useUserAssignments } from '../audit.api';
import { toAuditRowVM } from '../audit.mappers';
import type { AuditRowVM } from '../audit.types';

const PAGE_SIZE = 50;

/** Local sana → "YYYY-MM-DD" (timezone shift'siz; UTC+5 foydalanuvchi tanlagan kun). */
function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

function jsonText(v: unknown): string {
  if (v === null || v === undefined) return '';
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

export function AuditScreen() {
  const { t } = useTranslation();

  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [action, setAction] = useState('');
  const [resourceType, setResourceType] = useState('');
  const [userId, setUserId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<AuditRowVM | null>(null);

  const params = useMemo(
    () => ({
      from: from ?? undefined,
      to: to ?? undefined,
      action: action.trim() || undefined,
      resourceType: resourceType.trim() || undefined,
      userId: userId ?? undefined,
      page,
      pageSize: PAGE_SIZE,
    }),
    [from, to, action, resourceType, userId, page],
  );

  const query = useAuditLog(params);
  const assignmentsQuery = useUserAssignments();

  const userNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of assignmentsQuery.data ?? []) {
      map.set(a.userId, a.userFullName ?? a.userPhone);
    }
    return map;
  }, [assignmentsQuery.data]);

  const userOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const a of assignmentsQuery.data ?? []) {
      if (!seen.has(a.userId)) seen.set(a.userId, a.userFullName ?? a.userPhone);
    }
    return Array.from(seen, ([value, label]) => ({ value, label }));
  }, [assignmentsQuery.data]);

  const rows = (query.data?.data ?? []).map(toAuditRowVM);
  const meta = query.data?.meta;

  const onFilterChange = <T,>(setter: (v: T) => void) => {
    return (v: T) => {
      setter(v);
      setPage(1);
    };
  };

  const whoLabel = (uid: string | null) => {
    if (!uid) return t('audit.system');
    return userNameById.get(uid) ?? uid;
  };

  return (
    <Container size="xl">
      <Stack gap="lg">
        <PageHead title={t('audit.title')} />

        <Paper withBorder p="md" radius="md">
          <Group align="flex-end" wrap="wrap">
            <DateInput
              label={t('audit.from')}
              value={from ? new Date(from) : null}
              onChange={onFilterChange((v: Date | null) => setFrom(v ? toDateStr(v) : null))}
              valueFormat="DD.MM.YYYY"
              clearable
              w={160}
            />
            <DateInput
              label={t('audit.to')}
              value={to ? new Date(to) : null}
              onChange={onFilterChange((v: Date | null) => setTo(v ? toDateStr(v) : null))}
              valueFormat="DD.MM.YYYY"
              clearable
              w={160}
            />
            <TextInput
              label={t('audit.action')}
              placeholder={t('audit.action_placeholder')}
              value={action}
              onChange={(e) => onFilterChange(setAction)(e.currentTarget.value)}
              w={200}
            />
            <TextInput
              label={t('audit.resource_type')}
              placeholder={t('audit.resource_type_placeholder')}
              value={resourceType}
              onChange={(e) => onFilterChange(setResourceType)(e.currentTarget.value)}
              w={200}
            />
            <Select
              label={t('audit.user')}
              placeholder={t('audit.all_users')}
              data={userOptions}
              value={userId}
              onChange={onFilterChange(setUserId)}
              searchable
              clearable
              w={220}
            />
          </Group>
        </Paper>

        <Paper withBorder p="lg" radius="md">
          {query.isError ? (
            <StateView
              status="error"
              title={t('states.error_title')}
              retryLabel={t('states.retry')}
              onRetry={() => query.refetch()}
            />
          ) : query.isLoading ? (
            <StateView status="loading" skeleton="table" />
          ) : rows.length === 0 ? (
            <StateView status="empty" title={t('audit.empty')} />
          ) : (
            <Table verticalSpacing="xs" striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t('audit.col.when')}</Table.Th>
                  <Table.Th>{t('audit.col.who')}</Table.Th>
                  <Table.Th>{t('audit.col.action')}</Table.Th>
                  <Table.Th>{t('audit.col.resource')}</Table.Th>
                  <Table.Th>{t('audit.col.resource_id')}</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {rows.map((r) => (
                  <Table.Tr key={r.id}>
                    <Table.Td>{r.whenText}</Table.Td>
                    <Table.Td>{whoLabel(r.userId)}</Table.Td>
                    <Table.Td>
                      <Code>{r.action}</Code>
                    </Table.Td>
                    <Table.Td>{r.resourceType}</Table.Td>
                    <Table.Td>{r.resourceId ? <Mono>{r.resourceId}</Mono> : '—'}</Table.Td>
                    <Table.Td>
                      {r.hasDetail && (
                        <Button variant="subtle" size="compact-xs" onClick={() => setDetail(r)}>
                          {t('audit.detail')}
                        </Button>
                      )}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}

          {meta && meta.total > meta.pageSize && (
            <Pagination
              total={Math.ceil(meta.total / meta.pageSize)}
              value={page}
              onChange={setPage}
              mt="md"
            />
          )}
        </Paper>
      </Stack>

      <Modal
        opened={detail !== null}
        onClose={() => setDetail(null)}
        title={detail ? `${detail.action} — ${detail.resourceType}` : ''}
        size="lg"
        centered
      >
        {detail && (
          <Stack gap="md">
            <div>
              <Text fw={600} size="sm" mb={4}>
                {t('audit.before')}
              </Text>
              <JsonInput
                value={jsonText(detail.before)}
                readOnly
                autosize
                minRows={2}
                placeholder="—"
              />
            </div>
            <div>
              <Text fw={600} size="sm" mb={4}>
                {t('audit.after')}
              </Text>
              <JsonInput
                value={jsonText(detail.after)}
                readOnly
                autosize
                minRows={2}
                placeholder="—"
              />
            </div>
            {(detail.ip || detail.userAgent) && (
              <Text size="xs" c="dimmed">
                {detail.ip ?? '—'} · {detail.userAgent ?? '—'}
              </Text>
            )}
          </Stack>
        )}
      </Modal>
    </Container>
  );
}
