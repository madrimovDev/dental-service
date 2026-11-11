import { ApiError } from '@dental/api-client';
import { StateView } from '@dental/ui';
import { Button, Card, Group, Stack, Text, Title } from '@mantine/core';
import { IconFileSpreadsheet } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

export type AnswerQuery = {
  isLoading: boolean;
  isError: boolean;
  error?: unknown;
  refetch: () => unknown;
};

type Props = {
  title: string;
  query: AnswerQuery;
  /** Ma'lumot bor-yo'qligi (false → bo'sh holat). */
  hasData: boolean;
  /** Bir gaplik javob. */
  sentence: ReactNode;
  chart?: ReactNode;
  table?: ReactNode;
  howText: string;
  onExcel?: () => void;
  onOneC?: () => void;
  oneCLoading?: boolean;
};

/** Savolga javob: sarlavha + eksport → bir gaplik javob → grafik → «Qanday hisoblandi?» → jadval. */
export function AnswerShell({
  title,
  query,
  hasData,
  sentence,
  chart,
  table,
  howText,
  onExcel,
  onOneC,
  oneCLoading,
}: Props) {
  const { t } = useTranslation();
  const forbidden = query.error instanceof ApiError && query.error.status === 403;

  return (
    <Stack gap="md" data-testid="report-answer">
      <Card withBorder padding="lg" radius="lg">
        <Stack gap="md">
          <Group justify="space-between" align="baseline" wrap="wrap">
            <Title order={2} fz={22} id="q-h">
              {title}
            </Title>
            <Group gap="xs">
              {onExcel && (
                <Button
                  variant="default"
                  size="sm"
                  leftSection={<IconFileSpreadsheet size={16} />}
                  disabled={!hasData}
                  onClick={onExcel}
                >
                  {t('reportsQ.excel')}
                </Button>
              )}
              {onOneC && (
                <Button variant="default" size="sm" loading={oneCLoading} onClick={onOneC}>
                  {t('reportsQ.oneC')}
                </Button>
              )}
            </Group>
          </Group>

          {query.isLoading ? (
            <StateView status="loading" skeleton="cards" />
          ) : query.isError ? (
            forbidden ? (
              <StateView
                status="empty"
                title={t('reportsQ.forbidden')}
                description={t('reportsQ.lockHint.clinicWide')}
              />
            ) : (
              <StateView
                status="error"
                title={t('states.error_title')}
                retryLabel={t('states.retry')}
                onRetry={() => query.refetch()}
              />
            )
          ) : !hasData ? (
            <StateView status="empty" title={t('reportsQ.empty')} />
          ) : (
            <>
              <Text fz={18} lh={1.5}>
                {sentence}
              </Text>
              {chart}
            </>
          )}

          <details>
            <summary
              style={{
                cursor: 'pointer',
                fontWeight: 700,
                color: 'var(--primary-strong, var(--primary))',
                minHeight: 32,
              }}
            >
              {t('reportsQ.how')}
            </summary>
            <Text fz="sm" c="dimmed" mt={6}>
              {howText}
            </Text>
          </details>
        </Stack>
      </Card>
      {hasData && !query.isLoading && !query.isError && table}
    </Stack>
  );
}
