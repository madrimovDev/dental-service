import { AlertBanner } from '@dental/ui';
import { Title } from '@mantine/core';
import type { AttentionItem } from '../../reception.logic.ts';

export interface AttentionPanelProps {
  title: string;
  items: AttentionItem[];
  more: number;
  moreLabel: string;
  emptyText: string;
  onOpen: (to: string) => void;
}

/** «Diqqat talab qiladi» — AlertBanner (daraja 2/3), ≤3 + «yana N ta». Sof presentational. */
export function AttentionPanel({
  title,
  items,
  more,
  moreLabel,
  emptyText,
  onOpen,
}: AttentionPanelProps) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-card)',
        boxShadow: 'var(--shadow-sm)',
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <Title order={4} fw={700} c="var(--ink)">
        {title}
      </Title>
      {items.length === 0 ? (
        <span style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>{emptyText}</span>
      ) : (
        items.map((i) => (
          <AlertBanner
            key={i.key}
            tier={i.tier}
            title={i.title}
            action={{ label: i.actionLabel, onClick: () => onOpen(i.to) }}
          >
            {i.text}
          </AlertBanner>
        ))
      )}
      {more > 0 && <span style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>{moreLabel}</span>}
    </div>
  );
}
