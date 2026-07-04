import { Button, Stack, Text, TextInput, Title } from '@mantine/core';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

const CARD_STYLE: React.CSSProperties = {
  borderRadius: 'var(--radius-card)',
  padding: 18,
  marginBottom: 16,
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  boxShadow: 'var(--shadow-sm)',
};

export function DesktopServerConnectionCard() {
  const { t } = useTranslation();
  const [serverUrl, setServerUrl] = useState('');

  if (typeof window === 'undefined' || !window.dentalDesktop) {
    return null;
  }

  return (
    <Stack gap={10} style={CARD_STYLE} data-testid="desktop-server-card">
      <Title order={4} fw={700} c="var(--ink)">
        {t('settings.desktop_server_title')}
      </Title>
      <Text size="xs" c="var(--ink-3)">
        {t('settings.desktop_server_desc')}
      </Text>
      <TextInput
        label={t('settings.desktop_server_url_label')}
        placeholder={t('settings.desktop_server_url_placeholder')}
        value={serverUrl}
        onChange={(e) => setServerUrl(e.currentTarget.value)}
      />
      <Button size="xs" style={{ alignSelf: 'flex-start' }}>
        {t('settings.desktop_server_connect_button')}
      </Button>
    </Stack>
  );
}
