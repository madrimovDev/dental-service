import { Box, Button, Group, Stack, Text } from '@mantine/core';
import { IconStethoscope } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@/lib/format';
import type { PendingVisit } from '../cashier.types';

export interface PendingVisitsCardProps {
  visits: PendingVisit[];
  /** Hozir savatga olingan vizit (tanlangan qator ajratiladi). */
  activeVisitId: string | null;
  onTake: (visit: PendingVisit) => void;
}

/**
 * «Kutilayotgan vizitlar»: shifokor imzolagan, hali to'lanmagan bugungi vizitlar.
 * «Kassaga olish» savatni vizit xizmatlari (qulflangan narx) bilan to'ldiradi.
 * Bo'sh bo'lsa ham ko'rinadi — kassir ro'yxat bo'shligini biladi.
 */
export function PendingVisitsCard({ visits, activeVisitId, onTake }: PendingVisitsCardProps) {
  const { t } = useTranslation();
  return (
    <Box
      data-testid="pending-visits"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-card)',
        boxShadow: 'var(--shadow-sm)',
        overflow: 'hidden',
        fontFamily: 'var(--font-sans)',
      }}
    >
      <Group
        justify="space-between"
        wrap="nowrap"
        style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)' }}
      >
        <Group gap={8} wrap="nowrap">
          <IconStethoscope size={18} style={{ color: 'var(--primary)' }} />
          <Text fw={700} style={{ fontSize: 15, color: 'var(--ink)' }}>
            {t('cashierHandoff.title')}
          </Text>
        </Group>
        <Text
          fw={700}
          style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--ink-3)' }}
        >
          {visits.length}
        </Text>
      </Group>

      {visits.length === 0 ? (
        <Text size="sm" style={{ padding: '14px 18px', color: 'var(--ink-3)' }}>
          {t('cashierHandoff.empty')}
        </Text>
      ) : (
        <Stack gap={0}>
          {visits.map((v) => {
            const active = v.visitNoteId === activeVisitId;
            return (
              <Group
                key={v.visitNoteId}
                data-testid="pending-visit"
                justify="space-between"
                align="center"
                wrap="nowrap"
                style={{
                  padding: '12px 18px',
                  borderTop: '1px solid var(--border)',
                  background: active ? 'var(--primary-soft)' : undefined,
                }}
              >
                <Box style={{ minWidth: 0 }}>
                  <Text fw={600} lineClamp={1} style={{ fontSize: 13.5, color: 'var(--ink)' }}>
                    {v.patientName}
                  </Text>
                  <Text lineClamp={1} style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                    {[
                      v.doctorName ? t('cashierHandoff.doctor', { name: v.doctorName }) : null,
                      v.services
                        .map((s) =>
                          s.quantity > 1 ? `${s.serviceName} ×${s.quantity}` : s.serviceName,
                        )
                        .join(', '),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                  {v.hasUnpriced && (
                    <Text style={{ fontSize: 11.5, color: 'var(--danger)' }}>
                      {t('cashierHandoff.unpriced')}
                    </Text>
                  )}
                </Box>
                <Group gap={10} wrap="nowrap" style={{ flexShrink: 0 }}>
                  <Text fw={700} style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>
                    {formatCurrency(Number(v.total), t)}
                  </Text>
                  <Button
                    size="xs"
                    variant={active ? 'light' : 'default'}
                    disabled={v.hasUnpriced}
                    onClick={() => onTake(v)}
                  >
                    {t('cashierHandoff.take')}
                  </Button>
                </Group>
              </Group>
            );
          })}
        </Stack>
      )}
    </Box>
  );
}
