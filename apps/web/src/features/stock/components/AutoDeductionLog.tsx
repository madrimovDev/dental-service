import { Stack, Text, Title } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { formatLogTime, formatQty } from '../stock.mappers';
import type { AutoDeductionDto } from '../stock.types';

export interface AutoDeductionLogProps {
  rows: AutoDeductionDto[];
}

/** «Bugun avtomatik yechildi» — vizit yozuvidan kelgan chiqim/qaytarishlar jurnali. */
export function AutoDeductionLog({ rows }: AutoDeductionLogProps) {
  const { t } = useTranslation();
  return (
    <Stack gap={2}>
      <Title order={5} mb={6}>
        {t('stockScreen.logTitle')}
      </Title>
      {rows.length === 0 ? (
        <Text size="sm" c="dimmed">
          {t('stockScreen.logEmpty')}
        </Text>
      ) : (
        rows.map((r) => {
          const returned = r.type === 'in';
          return (
            <div
              key={r.id}
              style={{
                display: 'flex',
                gap: 10,
                padding: '8px 0',
                borderTop: '1px solid var(--border-subtle)',
                fontSize: 14,
              }}
            >
              <Text ff="monospace" size="sm" c="dimmed" w={44}>
                {formatLogTime(r.createdAt)}
              </Text>
              <Text size="sm" style={{ marginRight: 'auto' }}>
                {r.itemName} {returned ? '+' : '−'}
                {formatQty(Number(r.quantity))} {r.unit}
                {returned && ` · ${t('stockScreen.logReturned')}`}
              </Text>
              <Text size="sm" c="dimmed">
                {r.doctorName
                  ? t('stockScreen.logSource', { name: r.doctorName })
                  : t('stockScreen.logSourceUnknown')}
              </Text>
            </div>
          );
        })
      )}
      <Text size="xs" c="dimmed" mt={4}>
        {t('stockScreen.logNote')}
      </Text>
    </Stack>
  );
}
