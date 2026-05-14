import { Badge, Card, Container, Group, Stack, Text, Title } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { apiGet } from '@/lib/api-client.ts';

type HealthData = {
  ok: true;
  db: 'up' | 'down';
  ts: string;
};

export function HomePage() {
  const { t } = useTranslation();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['health'],
    queryFn: () => apiGet<HealthData>('/api/health'),
  });

  return (
    <Container size="sm" py="xl">
      <Stack gap="lg">
        <Title order={1}>{t('app.name')}</Title>
        <Text c="dimmed">{t('app.tagline')}</Text>

        <Card withBorder shadow="sm" padding="lg" radius="md">
          <Stack gap="sm">
            <Title order={3}>{t('health.title')}</Title>

            {isLoading && <Text c="dimmed">{t('common.loading')}</Text>}

            {isError && (
              <Badge color="red" size="lg">
                {t('common.error')}
              </Badge>
            )}

            {data && (
              <>
                <Group>
                  <Text>{t('health.db')}:</Text>
                  <Badge color={data.db === 'up' ? 'green' : 'red'}>{data.db}</Badge>
                </Group>
                <Text size="xs" c="dimmed">
                  {data.ts}
                </Text>
              </>
            )}
          </Stack>
        </Card>
      </Stack>
    </Container>
  );
}
