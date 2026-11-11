import { Box, Text, Title } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { formatCurrency, formatNumber } from '@/lib/format';
import type { OwnerToday } from '../dashboard.api.ts';

const SECTION = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-card)',
  boxShadow: 'var(--shadow-sm)',
} as const;
const MONO = { fontFamily: 'var(--font-mono, monospace)' } as const;

/** «Filiallar bugun» — Filial / Sof tushum / Bemorlar / Kreslo bandligi / Holat. */
export function BranchesToday({ data }: { data: OwnerToday | undefined }) {
  const { t } = useTranslation();
  const th = { padding: '10px 8px', fontWeight: 600, fontSize: 13, color: 'var(--ink-2)' } as const;
  return (
    <Box component="section" aria-labelledby="owner-br-h" style={{ ...SECTION, overflowX: 'auto' }}>
      <Title
        order={4}
        id="owner-br-h"
        fw={700}
        c="var(--ink)"
        style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}
      >
        {t('ownerHome.branchesToday')}
      </Title>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
        <thead>
          <tr style={{ textAlign: 'left' }}>
            <th scope="col" style={{ ...th, paddingLeft: 20 }}>
              {t('ownerHome.colBranch')}
            </th>
            <th scope="col" style={{ ...th, textAlign: 'right' }}>
              {t('ownerHome.colNetRevenue')}
            </th>
            <th scope="col" style={{ ...th, textAlign: 'right' }}>
              {t('ownerHome.colPatients')}
            </th>
            <th scope="col" style={{ ...th, textAlign: 'right' }}>
              {t('ownerHome.colOccupancy')}
            </th>
            <th scope="col" style={{ ...th, paddingRight: 20 }}>
              {t('ownerHome.colStatus')}
            </th>
          </tr>
        </thead>
        <tbody>
          {(data?.branches ?? []).map((b) => (
            <tr key={b.branchId} style={{ borderTop: '1px solid var(--border)' }}>
              <td style={{ padding: '12px 8px 12px 20px', fontWeight: 700 }}>{b.name}</td>
              <td style={{ padding: '12px 8px', textAlign: 'right', ...MONO }}>
                {formatCurrency(b.netRevenue, t)}
              </td>
              <td style={{ padding: '12px 8px', textAlign: 'right', ...MONO }}>
                {formatNumber(b.patients)}
              </td>
              <td style={{ padding: '12px 8px', textAlign: 'right', ...MONO }}>
                {Math.round(b.occupancy * 100)}%
              </td>
              <td style={{ padding: '12px 20px 12px 8px' }}>
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    borderRadius: 99,
                    padding: '3px 10px',
                    background: b.status === 'active' ? 'var(--success-soft)' : 'var(--surface-2)',
                    color: b.status === 'active' ? 'var(--success)' : 'var(--ink-2)',
                  }}
                >
                  {t(b.status === 'active' ? 'ownerHome.branchActive' : 'ownerHome.branchIdle')}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Box>
  );
}

/** «Shifokorlar bugun» — progress bar (qabul qilingan / rejalangan) + shifokor tushumi. */
export function DoctorsToday({
  data,
  names,
}: {
  data: OwnerToday | undefined;
  names: Map<string, string> | undefined;
}) {
  const { t } = useTranslation();
  return (
    <Box component="section" aria-labelledby="owner-dr-h" style={SECTION}>
      <Title
        order={4}
        id="owner-dr-h"
        fw={700}
        c="var(--ink)"
        style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}
      >
        {t('ownerHome.doctorsToday')}
      </Title>
      {(data?.doctors ?? []).map((d) => {
        const pct = d.planned > 0 ? Math.min(100, Math.round((d.done / d.planned) * 100)) : 0;
        return (
          <Box
            key={d.doctorId}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: '12px 20px',
              borderTop: '1px solid var(--border)',
            }}
          >
            <Text fw={600} style={{ width: 180 }}>
              {names?.get(d.doctorId) ?? d.doctorId}
            </Text>
            <Box style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <Box
                role="img"
                aria-label={t('ownerHome.doctorProgressAria', { done: d.done, planned: d.planned })}
                style={{
                  height: 10,
                  borderRadius: 99,
                  background: 'var(--surface-2)',
                  overflow: 'hidden',
                }}
              >
                <Box style={{ width: `${pct}%`, height: '100%', background: 'var(--primary)' }} />
              </Box>
              <Text size="sm" c="var(--ink-2)">
                {t('ownerHome.doctorProgress', { done: d.done, planned: d.planned })}
              </Text>
            </Box>
            <Text fw={700} style={{ width: 130, textAlign: 'right', ...MONO }}>
              {formatCurrency(d.revenue, t)}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}
