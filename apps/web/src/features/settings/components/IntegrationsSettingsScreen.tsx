import { StatusPill } from '@dental/ui';
import { Button, Title } from '@mantine/core';
import {
  type Icon,
  IconBrandTelegram,
  IconFileSpreadsheet,
  IconMessage,
  IconReceiptTax,
} from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { SettingsShell } from './SettingsShell';

type IntegrationCard = {
  id: string;
  nameKey: string;
  descKey: string;
  icon: Icon;
  connected: boolean;
};

// DS12 deferred — statik chrome. Hech qanday hook/API/persist YO'Q.
// Real ulanish/holat backend DS12'ga defer qilingan.
const CARDS: IntegrationCard[] = [
  {
    id: 'eskiz',
    nameKey: 'settings.integration_eskiz_name',
    descKey: 'settings.integration_eskiz_desc',
    icon: IconMessage,
    connected: true,
  },
  {
    id: 'telegram',
    nameKey: 'settings.integration_telegram_name',
    descKey: 'settings.integration_telegram_desc',
    icon: IconBrandTelegram,
    connected: true,
  },
  {
    id: 'soliq',
    nameKey: 'settings.integration_soliq_name',
    descKey: 'settings.integration_soliq_desc',
    icon: IconReceiptTax,
    connected: false,
  },
  {
    id: 'onec',
    nameKey: 'settings.integration_onec_name',
    descKey: 'settings.integration_onec_desc',
    icon: IconFileSpreadsheet,
    connected: false,
  },
];

export function IntegrationsSettingsScreen() {
  const { t } = useTranslation();

  return (
    <SettingsShell active="integrations">
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 14,
        }}
      >
        {CARDS.map((card) => {
          const Icon = card.icon;
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
                <StatusPill status={card.connected ? 'success' : 'neutral'}>
                  {card.connected
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

              {card.connected ? (
                <Button variant="outline" size="xs" style={{ alignSelf: 'flex-start' }}>
                  {t('settings.integration_configure')}
                </Button>
              ) : (
                <Button
                  size="xs"
                  style={{
                    alignSelf: 'flex-start',
                    background: 'var(--primary)',
                    color: 'var(--on-primary)',
                  }}
                >
                  {t('settings.integration_connect')}
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </SettingsShell>
  );
}
