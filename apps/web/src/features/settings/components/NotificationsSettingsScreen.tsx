import { Text } from '@mantine/core';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SettingsShell } from './SettingsShell';

// Statik pref ro'yxati — i18n kalitlarga ishora qiladi.
// DS12 deferred: backend YO'Q, persist YO'Q. Toggle = vizual lokal state (V3 scaffold posturasi).
const NOTIFY_PREFS = ['appointment', 'recall', 'birthday', 'lab'] as const;

type NotifyPrefKey = (typeof NOTIFY_PREFS)[number];

function PrefToggle({
  checked,
  onToggle,
  label,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onToggle}
      style={{
        flexShrink: 0,
        width: 38,
        height: 22,
        padding: 0,
        borderRadius: 999,
        border: checked ? 'none' : '1px solid var(--border)',
        background: checked ? 'var(--primary)' : 'var(--surface-2)',
        cursor: 'pointer',
        position: 'relative',
        transition: 'background 0.15s ease',
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 2,
          left: checked ? 18 : 2,
          width: 18,
          height: 18,
          borderRadius: '50%',
          background: checked ? 'var(--on-primary)' : 'var(--ink-3)',
          transition: 'left 0.15s ease',
        }}
      />
    </button>
  );
}

export function NotificationsSettingsScreen() {
  const { t } = useTranslation();
  // Vizual-only lokal holat (DS12 deferred — backend ulanmagan).
  const [enabled, setEnabled] = useState<Record<NotifyPrefKey, boolean>>({
    appointment: true,
    recall: true,
    birthday: false,
    lab: false,
  });

  return (
    <SettingsShell active="notify">
      <div
        style={{
          maxWidth: 680,
          border: '1px solid var(--border)',
          borderRadius: 16,
          background: 'var(--surface)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '16px 18px',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <Text fw={700} style={{ fontSize: 16, color: 'var(--ink)' }}>
            {t('settings.notify_title')}
          </Text>
        </div>

        <div>
          {NOTIFY_PREFS.map((key) => {
            const title = t(`settings.notify_pref_${key}_title`);
            return (
              <div
                key={key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 16,
                  padding: '14px 18px',
                  borderTop: '1px solid var(--border)',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <Text style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>
                    {title}
                  </Text>
                  <Text style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                    {t(`settings.notify_pref_${key}_desc`)}
                  </Text>
                </div>
                <PrefToggle
                  checked={enabled[key]}
                  label={title}
                  onToggle={() => setEnabled((prev) => ({ ...prev, [key]: !prev[key] }))}
                />
              </div>
            );
          })}
        </div>
      </div>
    </SettingsShell>
  );
}
