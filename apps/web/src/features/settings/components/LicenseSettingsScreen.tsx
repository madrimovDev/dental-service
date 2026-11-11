import { AlertBanner, Button, StateView } from '@dental/ui';
import { useTranslation } from 'react-i18next';
import { useLicenseStatus, useRecheckLicense } from '@/features/license/license.api';
import { SettingsShell } from './SettingsShell';

const CARD_STYLE: React.CSSProperties = {
  maxWidth: 620,
  borderRadius: 'var(--radius-card)',
  padding: 22,
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  boxShadow: 'var(--shadow-sm)',
};

const fmt = (iso: string | null, lang: string) =>
  iso ? new Date(iso).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'uz-UZ') : '—';

/** Sozlamalar → Litsenziya (faqat desktop): holat, tugash sanasi, «Qayta tekshirish» (heartbeat). */
export function LicenseSettingsScreen() {
  const { t, i18n } = useTranslation();
  const query = useLicenseStatus();
  const recheck = useRecheckLicense();
  const data = query.data;

  return (
    <SettingsShell active="license">
      {query.isError ? (
        <StateView
          status="error"
          title={t('states.error_title')}
          retryLabel={t('states.retry')}
          onRetry={() => query.refetch()}
        />
      ) : !data ? (
        <StateView status="loading" skeleton="cards" />
      ) : (
        <section aria-label={t('settings.license.title')} style={CARD_STYLE}>
          <h2 style={{ margin: '0 0 12px', fontSize: 18 }}>{t('settings.license.title')}</h2>
          {(data.state === 'expiring' || data.state === 'grace') && data.daysLeft != null && (
            <div style={{ marginBottom: 12 }}>
              <AlertBanner tier={2}>
                {t(`license.banner.${data.state}`, { count: data.daysLeft })}
              </AlertBanner>
            </div>
          )}
          <dl
            style={{
              display: 'grid',
              gridTemplateColumns: 'max-content 1fr',
              gap: '8px 16px',
              margin: 0,
            }}
          >
            <dt style={{ color: 'var(--ink-2)' }}>{t('settings.license.state')}</dt>
            <dd style={{ margin: 0, fontWeight: 600 }}>
              {t(`settings.license.state_${data.state}`, data.state)}
            </dd>
            <dt style={{ color: 'var(--ink-2)' }}>{t('settings.license.expires')}</dt>
            <dd style={{ margin: 0, fontWeight: 600 }}>{fmt(data.expiresAt, i18n.language)}</dd>
            <dt style={{ color: 'var(--ink-2)' }}>{t('settings.license.days_left')}</dt>
            <dd style={{ margin: 0, fontWeight: 600 }}>{data.daysLeft ?? '—'}</dd>
          </dl>
          <p style={{ color: 'var(--ink-3)', fontSize: 13, margin: '14px 0' }}>
            {t('settings.license.renew_hint')}
          </p>
          <Button variant="primary" onClick={() => recheck.mutate()} disabled={recheck.isPending}>
            {t('license.blocked.recheck')}
          </Button>
        </section>
      )}
    </SettingsShell>
  );
}
