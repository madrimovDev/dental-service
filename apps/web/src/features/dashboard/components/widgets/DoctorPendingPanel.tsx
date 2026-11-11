import { Box, Stack, Text, Title } from '@mantine/core';
import { Link } from 'react-router-dom';
import type { DoctorPending } from '../../doctor.api.ts';

export interface PendingRow {
  key: string;
  count: number;
  title: string;
  text: string;
  to: string;
}

/** Sof: agregatdan «Mendan kutilmoqda» qatorlarini quradi (faqat count>0). */
export function buildPendingRows(
  p: DoctorPending,
  label: (key: 'notes' | 'images' | 'plans', n: number) => string,
  plansText: (days: number | null) => string,
): PendingRow[] {
  const names = (items: { patientName: string }[]) => items.map((i) => i.patientName).join(', ');
  const rows: PendingRow[] = [
    {
      key: 'notes',
      count: p.unsignedVisitNotes.count,
      title: label('notes', p.unsignedVisitNotes.count),
      text: names(p.unsignedVisitNotes.items),
      to: p.unsignedVisitNotes.items[0]
        ? `/patients/${p.unsignedVisitNotes.items[0].patientId}`
        : '/patients',
    },
    {
      key: 'images',
      count: p.unreviewedImages.count,
      title: label('images', p.unreviewedImages.count),
      text: names(p.unreviewedImages.items),
      to: p.unreviewedImages.items[0]
        ? `/patients/${p.unreviewedImages.items[0].patientId}`
        : '/patients',
    },
    {
      key: 'plans',
      count: p.plansAwaitingResponse.count,
      title: label('plans', p.plansAwaitingResponse.count),
      text: plansText(p.plansAwaitingResponse.oldestDays),
      to: p.plansAwaitingResponse.items[0]
        ? `/patients/${p.plansAwaitingResponse.items[0].patientId}`
        : '/patients',
    },
  ];
  return rows.filter((r) => r.count > 0);
}

export function DoctorPendingPanel({
  title,
  emptyText,
  rows,
}: {
  title: string;
  emptyText: string;
  rows: PendingRow[];
}) {
  return (
    <Box
      style={{
        border: '1px solid var(--border)',
        borderRadius: 12,
        background: 'var(--surface)',
        overflow: 'hidden',
      }}
    >
      <Title order={3} style={{ fontSize: 16, padding: '14px 20px' }}>
        {title}
      </Title>
      {rows.length === 0 ? (
        <Text size="sm" c="dimmed" style={{ padding: '4px 20px 16px' }}>
          {emptyText}
        </Text>
      ) : (
        <Stack gap={0}>
          {rows.map((r) => (
            <Link
              key={r.key}
              to={r.to}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                minHeight: 56,
                padding: '8px 20px',
                borderTop: '1px solid var(--border)',
                color: 'var(--ink)',
                textDecoration: 'none',
              }}
            >
              <span style={{ fontSize: 22, fontWeight: 700, minWidth: 24 }}>{r.count}</span>
              <span style={{ flex: 1 }}>
                <span style={{ display: 'block', fontWeight: 600, fontSize: 14 }}>{r.title}</span>
                <span style={{ display: 'block', fontSize: 13, color: 'var(--ink-3)' }}>
                  {r.text}
                </span>
              </span>
              <span aria-hidden>→</span>
            </Link>
          ))}
        </Stack>
      )}
    </Box>
  );
}
