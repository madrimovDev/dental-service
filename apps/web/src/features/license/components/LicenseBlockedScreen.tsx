import { Button, Center, Stack, Text, Title } from '@mantine/core';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useRecheckLicense } from '../license.api';

export function LicenseBlockedScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const recheck = useRecheckLicense();
  const [stillExpired, setStillExpired] = useState(false);

  const onRecheck = () => {
    setStillExpired(false);
    recheck.mutate(undefined, {
      onSuccess: (res) => {
        if (['active', 'expiring', 'grace'].includes(res.state)) {
          navigate('/');
        } else {
          setStillExpired(true);
        }
      },
      onError: () => setStillExpired(true),
    });
  };

  return (
    <Center mih="100vh" p="md">
      <Stack align="center" gap="sm" maw={480}>
        <Title order={2}>{t('license.blocked.title')}</Title>
        <Text ta="center">{t('license.blocked.body')}</Text>
        <Text ta="center" c="dimmed">
          {t('license.blocked.internet')}
        </Text>
        {stillExpired && (
          <Text c="red" role="alert">
            {t('license.blocked.stillExpired')}
          </Text>
        )}
        <Button onClick={onRecheck} loading={recheck.isPending}>
          {t('license.blocked.recheck')}
        </Button>
      </Stack>
    </Center>
  );
}
