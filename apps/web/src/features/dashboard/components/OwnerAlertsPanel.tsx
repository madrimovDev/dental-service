import { Box, Stack, Text, Title } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useLicenseStatus } from '@/features/license/license.api.ts';
import { formatCurrency } from '@/lib/format';
import { useBackupStatus, useDebtAging } from '../dashboard.api.ts';
import { buildOwnerAlerts, type OwnerAlertLevel } from '../owner-alerts.ts';

const LEVEL_STYLE: Record<OwnerAlertLevel, { bg: string; border: string; tag: string }> = {
  critical: { bg: 'var(--danger-soft)', border: 'var(--danger)', tag: 'var(--danger)' },
  warning: { bg: 'var(--warning-soft)', border: 'var(--warning)', tag: 'var(--warning)' },
  info: { bg: 'var(--surface-2)', border: 'var(--border)', tag: 'var(--ink-3)' },
};

/**
 * «Siz hal qiladigan masalalar» — darajali (Kritik/Diqqat/Ma'lumot) ro'yxat.
 * Zaxira (desktop), litsenziya (desktop) va qarz muddati manbalaridan yig'iladi;
 * darajani rang BILAN BIRGA matn yorlig'i ham bildiradi.
 */
export function OwnerAlertsPanel() {
  const { t } = useTranslation();
  const { data: backup } = useBackupStatus();
  const { data: license } = useLicenseStatus();
  const { data: debt } = useDebtAging();

  const over90 = debt?.buckets.find((b) => b.key === 'd90_plus')?.amount ?? 0;
  const alerts = buildOwnerAlerts({
    backup,
    license,
    debt,
    overdueDebtText: formatCurrency(over90, t),
  });

  return (
    <Box
      component="section"
      aria-labelledby="owner-alerts-h"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-card)',
        boxShadow: 'var(--shadow-sm)',
        padding: '16px 18px',
      }}
    >
      <Stack gap="sm">
        <Title order={4} id="owner-alerts-h" fw={700} c="var(--ink)">
          {t('ownerHome.title')}
        </Title>
        {alerts.length === 0 && (
          <Text size="sm" c="var(--ink-2)">
            {t('ownerHome.allClear')}
          </Text>
        )}
        {alerts.map((a) => {
          const s = LEVEL_STYLE[a.level];
          return (
            <Box
              key={a.id}
              data-testid={`owner-alert-${a.id}`}
              data-level={a.level}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 3,
                padding: '12px 14px',
                borderRadius: 10,
                background: s.bg,
                border: `1px solid ${s.border}`,
              }}
            >
              <Text
                component="span"
                style={{
                  alignSelf: 'flex-start',
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: '.04em',
                  textTransform: 'uppercase',
                  color: s.tag,
                }}
              >
                {t(
                  `ownerHome.level${a.level === 'critical' ? 'Critical' : a.level === 'warning' ? 'Warning' : 'Info'}`,
                )}
              </Text>
              <Text fw={700} c="var(--ink)">
                {t(a.titleKey, a.titleVars)}
              </Text>
              <Text size="sm" c="var(--ink-2)">
                {t(a.textKey, a.textVars)}
              </Text>
              <Text
                component={Link}
                to={a.href}
                size="sm"
                fw={700}
                style={{ color: 'var(--primary)', minHeight: 24 }}
              >
                {t(a.ctaKey)} →
              </Text>
            </Box>
          );
        })}
      </Stack>
    </Box>
  );
}
