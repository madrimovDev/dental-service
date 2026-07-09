import type { TenantSettings } from '@dental/api-client';
import { StatusPill } from '@dental/ui';
import { Button, Loader, Title, Tooltip } from '@mantine/core';
import {
  type Icon,
  IconBrandTelegram,
  IconFileSpreadsheet,
  IconMessage,
  IconReceiptTax,
} from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { useTenantSettings } from '../settings.api';
import { DesktopServerConnectionCard } from './DesktopServerConnectionCard';
import { SettingsShell } from './SettingsShell';

/**
 * Integratsiya kartalari. Holat (`connected`) backend
 * `tenant_settings.integration_settings` JSONB'dan o'qiladi (GET): `telegram`/`sms`
 * (Eskiz) provayderlari uchun maskalangan `configured` (CLI-379/400 — xom kredensial
 * hech qachon qaytarilmaydi, faqat "sozlangan/mi" + oxirgi 4 belgi hint). `soliq`/`onec`
 * hali backend-tomondan boshqarilmaydi (scaffold — Faza 3 jonli faollashtirish), shu
 * sabab doimo «Ulanmagan».
 *
 * Connect/Configure tugmalari scaffold — real cred-yig'ish forma Task 8'da keladi
 * (bu ekran hozircha faqat `configured` holatini ko'rsatadi, disabled tugmalar bilan).
 */
type IntegrationCard = {
  id: string;
  nameKey: string;
  descKey: string;
  icon: Icon;
  /** `integration_settings` ichidagi provayder kaliti; yo'q bo'lsa — scaffold (doim off). */
  provider?: keyof TenantSettings['integrationSettings'];
};

const CARDS: IntegrationCard[] = [
  {
    id: 'eskiz',
    nameKey: 'settings.integration_eskiz_name',
    descKey: 'settings.integration_eskiz_desc',
    icon: IconMessage,
    provider: 'sms',
  },
  {
    id: 'telegram',
    nameKey: 'settings.integration_telegram_name',
    descKey: 'settings.integration_telegram_desc',
    icon: IconBrandTelegram,
    provider: 'telegram',
  },
  {
    id: 'soliq',
    nameKey: 'settings.integration_soliq_name',
    descKey: 'settings.integration_soliq_desc',
    icon: IconReceiptTax,
  },
  {
    id: 'onec',
    nameKey: 'settings.integration_onec_name',
    descKey: 'settings.integration_onec_desc',
    icon: IconFileSpreadsheet,
  },
];

export function IntegrationsSettingsScreen() {
  const { t } = useTranslation();
  const settings = useTenantSettings();
  const integrations = settings.data?.integrationSettings;

  return (
    <SettingsShell active="integrations">
      <DesktopServerConnectionCard />
      {settings.isLoading || !integrations ? (
        <div style={{ padding: 24 }}>
          <Loader size="sm" />
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 14,
          }}
        >
          {CARDS.map((card) => {
            const Icon = card.icon;
            const connected = card.provider ? integrations[card.provider].configured : false;
            return (
              <div
                key={card.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                  borderRadius: 'var(--radius-card)',
                  padding: 18,
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                  boxShadow: 'var(--shadow-sm)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                  }}
                >
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      background: 'var(--surface-2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--ink-2)',
                      flexShrink: 0,
                    }}
                  >
                    <Icon size={20} stroke={1.6} />
                  </div>
                  <StatusPill status={connected ? 'success' : 'neutral'}>
                    {connected
                      ? t('settings.integration_status_connected')
                      : t('settings.integration_status_off')}
                  </StatusPill>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <Title order={4} fw={700} c="var(--ink)">
                    {t(card.nameKey)}
                  </Title>
                  <span style={{ fontSize: 12.5, color: 'var(--ink-3)', lineHeight: 1.4 }}>
                    {t(card.descKey)}
                  </span>
                </div>

                {connected ? (
                  <Tooltip label={t('shell.coming_soon')}>
                    <span style={{ alignSelf: 'flex-start' }}>
                      <Button variant="outline" size="xs" disabled>
                        {t('settings.integration_configure')}
                      </Button>
                    </span>
                  </Tooltip>
                ) : (
                  <Tooltip label={t('shell.coming_soon')}>
                    <span style={{ alignSelf: 'flex-start' }}>
                      <Button
                        size="xs"
                        disabled
                        style={{
                          background: 'var(--primary)',
                          color: 'var(--on-primary)',
                        }}
                      >
                        {t('settings.integration_connect')}
                      </Button>
                    </span>
                  </Tooltip>
                )}
              </div>
            );
          })}
        </div>
      )}
    </SettingsShell>
  );
}
