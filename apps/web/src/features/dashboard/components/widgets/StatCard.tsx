import type { CSSProperties, ReactNode } from 'react';

/** Icon-chip va delta tone'lari — token juftliklari (fg + soft-bg). */
export type StatCardTone = 'primary' | 'info' | 'violet' | 'warning';
export type StatDeltaTone = 'success' | 'danger' | 'warning' | 'muted';

const TONE_FG: Record<StatCardTone, string> = {
  primary: 'var(--primary)',
  info: 'var(--info)',
  violet: 'var(--violet)',
  warning: 'var(--warning)',
};

const TONE_SOFT: Record<StatCardTone, string> = {
  primary: 'var(--primary-soft)',
  info: 'var(--info-soft)',
  violet: 'var(--violet-soft)',
  warning: 'var(--warning-soft)',
};

const DELTA_COLOR: Record<StatDeltaTone, string> = {
  success: 'var(--success)',
  danger: 'var(--danger)',
  warning: 'var(--warning)',
  muted: 'var(--ink-3)',
};

export interface StatCardDelta {
  /** Yo'nalish: yuqori (▲), past (▼) yoki neytral (o'qsiz). */
  direction: 'up' | 'down' | 'flat';
  text: ReactNode;
  tone?: StatDeltaTone;
}

export interface StatCardProps {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  /** Eski kontrakt: qiymat matni rangi (yashil/qizil h.k.). */
  color?: string;
  /** Ixtiyoriy o'ng yuqori 32×32 icon-chip ichidagi ikona. */
  icon?: ReactNode;
  /** Icon-chip va default tinting tone'i. */
  tone?: StatCardTone;
  /** Qiymat yonidagi ixtiyoriy birlik (so'm, %, ...). */
  unit?: ReactNode;
  /**
   * Ixtiyoriy period-over-period delta — FAQAT real data bo'lganda beriladi.
   * DS1 manager KPI'larida data-gap (ds12) → berilmaydi, render qilinmaydi.
   */
  delta?: StatCardDelta;
  /**
   * Ixtiyoriy 78×30 sparkline SVG (ReactNode) — FAQAT real seriya bo'lganda.
   * DS1'da time-series hook yo'q (data-gap) → berilmaydi, render qilinmaydi.
   */
  spark?: ReactNode;
}

// Off-scale literallar (gap brief §1b) — tokenga aniq mos kelmaydi, parity uchun saqlanadi.
const CARD_RADIUS = 16; // tokenlar --radius-xl:14px'da to'xtaydi
const CARD_PADDING = '16px 16px 13px'; // 13px 4px-shkaladan tashqari

const cardStyle: CSSProperties = {
  borderRadius: CARD_RADIUS,
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  boxShadow: 'var(--shadow-sm)',
  padding: CARD_PADDING,
};

const labelStyle: CSSProperties = {
  fontSize: '11.5px',
  fontWeight: 600,
  letterSpacing: '.02em',
  color: 'var(--ink-3)',
  textTransform: 'uppercase',
};

const valueStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 26, // --text-2xl(22) va --text-display(27) orasida — parity literal
  fontWeight: 600,
  letterSpacing: '-.03em', // mockup shu yerda -.03em (boshqa joyda --ls-tight:-.02em)
  lineHeight: 1,
};

/** KPI raqam + label + ixtiyoriy izoh/icon-chip/delta/sparkline. Og'ir grafiksiz. */
export function StatCard({
  label,
  value,
  hint,
  color,
  icon,
  tone = 'primary',
  unit,
  delta,
  spark,
}: StatCardProps) {
  const deltaTone = delta?.tone ?? 'muted';
  return (
    <div style={cardStyle}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 8,
          marginBottom: 12,
        }}
      >
        <span style={labelStyle}>{label}</span>
        {icon != null && (
          <span
            style={{
              flex: 'none',
              width: 32,
              height: 32,
              borderRadius: 9,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: TONE_SOFT[tone],
              color: TONE_FG[tone],
              fontSize: 17,
            }}
          >
            {icon}
          </span>
        )}
      </div>

      <div
        style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 }}
      >
        <div style={{ minWidth: 0 }}>
          <span style={{ ...valueStyle, color: color ?? 'var(--ink)' }}>{value}</span>
          {unit != null && (
            <span style={{ marginLeft: 4, fontSize: '11.5px', color: 'var(--ink-3)' }}>{unit}</span>
          )}
          {delta != null && (
            <div
              style={{
                marginTop: 7,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 12,
                fontWeight: 700,
                color: DELTA_COLOR[deltaTone],
              }}
            >
              {delta.direction !== 'flat' && (
                <span aria-hidden style={{ fontSize: 13, lineHeight: 1 }}>
                  {delta.direction === 'up' ? '▲' : '▼'}
                </span>
              )}
              <span>{delta.text}</span>
            </div>
          )}
        </div>
        {spark != null && <div style={{ flex: 'none' }}>{spark}</div>}
      </div>

      {hint != null && (
        <div style={{ marginTop: 8, fontSize: '11.5px', color: 'var(--ink-3)' }}>{hint}</div>
      )}
    </div>
  );
}
