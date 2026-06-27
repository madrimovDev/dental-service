import type { UpdateTenantSettingsBody } from '@dental/api-client';
import { Loader, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/auth-store.ts';
import { useTenantSettings, useUpdateTenantSettings } from '../settings.api';
import { SettingsShell } from './SettingsShell';

/**
 * Bildirishnoma toggle'lari — backend `tenant_settings.notification_settings` JSONB'ga
 * ulangan (GET/PATCH). FAQAT haqiqiy backend maydoni + mavjud i18n kaliti mos kelgan
 * toggle'lar ko'rsatiladi (DS12). `paymentReceipt` backend maydoni hozircha i18n kalitsiz
 * (Faza 4a placeholder birthday/lab keylagan) — yangi kalit qo'shilmaguncha defer.
 *
 * Har toggle DARHOL saqlanadi (qisman PATCH; backend qolgan maydonlarni merge qiladi).
 */
const NOTIFY_ITEMS = [
  { field: 'appointmentReminder', i18nKey: 'appointment' },
  { field: 'recallSms', i18nKey: 'recall' },
] as const satisfies readonly {
  field: keyof NonNullable<UpdateTenantSettingsBody['notificationSettings']>;
  i18nKey: string;
}[];

function PrefToggle({
  checked,
  onToggle,
  disabled,
  label,
}: {
  checked: boolean;
  onToggle: () => void;
  disabled: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      style={{
        flexShrink: 0,
        width: 38,
        height: 22,
        padding: 0,
        borderRadius: 999,
        border: checked ? 'none' : '1px solid var(--border)',
        background: checked ? 'var(--primary)' : 'var(--surface-2)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1,
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
  const { hasPermission } = useAuthStore();
  const settings = useTenantSettings();
  const update = useUpdateTenantSettings();
  const canEdit = hasPermission('tenant_settings.edit');

  const prefs = settings.data?.notificationSettings;

  const toggle = (field: (typeof NOTIFY_ITEMS)[number]['field']) => {
    if (!prefs) return;
    update.mutate({ notificationSettings: { [field]: !prefs[field] } });
  };

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

        {settings.isLoading || !prefs ? (
          <div style={{ padding: 24 }}>
            <Loader size="sm" />
          </div>
        ) : (
          <div>
            {NOTIFY_ITEMS.map(({ field, i18nKey }) => {
              const title = t(`settings.notify_pref_${i18nKey}_title`);
              return (
                <div
                  key={field}
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
                      {t(`settings.notify_pref_${i18nKey}_desc`)}
                    </Text>
                  </div>
                  <PrefToggle
                    checked={prefs[field]}
                    label={title}
                    disabled={!canEdit || update.isPending}
                    onToggle={() => toggle(field)}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </SettingsShell>
  );
}
