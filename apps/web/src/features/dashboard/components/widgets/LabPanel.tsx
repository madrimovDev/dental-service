import { StatusPill } from '@dental/ui';
import { Box, Title } from '@mantine/core';
import { Link } from 'react-router-dom';

export interface LabRow {
  id: string;
  what: string;
  meta: string;
  status: string;
  statusLabel: string;
}

const MEANING: Record<string, 'planned' | 'waiting' | 'confirmed' | 'done'> = {
  sent: 'planned',
  in_progress: 'waiting',
  ready: 'confirmed',
};

/** O'ng rail: shifokorning faol lab buyurtmalari (kanvas «Laboratoriya»). */
export function LabPanel({
  title,
  newLabel,
  emptyText,
  rows,
}: {
  title: string;
  newLabel: string;
  emptyText: string;
  rows: LabRow[];
}) {
  return (
    <Box
      component="section"
      style={{
        border: '1px solid var(--border)',
        borderRadius: 12,
        background: 'var(--surface)',
        padding: '16px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <Box style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <Title order={3} style={{ fontSize: 16 }}>
          {title}
        </Title>
        <Link
          to="/lab"
          style={{ fontSize: 14, fontWeight: 600, color: 'var(--primary)', textDecoration: 'none' }}
        >
          {newLabel}
        </Link>
      </Box>
      {rows.length === 0 ? (
        <span style={{ fontSize: 14, color: 'var(--ink-3)' }}>{emptyText}</span>
      ) : (
        rows.map((r) => (
          <Box
            key={r.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 0',
              borderTop: '1px solid var(--border)',
            }}
          >
            <span style={{ display: 'flex', flexDirection: 'column', marginRight: 'auto' }}>
              <b style={{ fontWeight: 600 }}>{r.what}</b>
              {r.meta && <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>{r.meta}</span>}
            </span>
            <StatusPill status={MEANING[r.status] ?? 'done'}>{r.statusLabel}</StatusPill>
          </Box>
        ))
      )}
    </Box>
  );
}
