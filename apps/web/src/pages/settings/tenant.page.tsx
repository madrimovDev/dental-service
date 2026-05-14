import {
  Alert,
  Badge,
  Button,
  Card,
  Container,
  Group,
  Loader,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from 'mantine-form-zod-resolver';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { api } from '@/lib/api.ts';
import { useAuthStore } from '@/stores/auth-store.ts';

const schema = z.object({
  name: z.string().min(2).max(120),
  defaultLanguage: z.enum(['uz', 'ru']),
});
type FormValues = z.infer<typeof schema>;

export function TenantSettingsPage() {
  const { t } = useTranslation();
  const { hasPermission } = useAuthStore();
  const qc = useQueryClient();

  const tenantQuery = useQuery({ queryKey: ['tenant'], queryFn: api.tenant.get });

  const form = useForm<FormValues>({
    initialValues: { name: '', defaultLanguage: 'uz' },
    validate: zodResolver(schema),
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: form.setValues stable, dont include
  useEffect(() => {
    if (tenantQuery.data) {
      form.setValues({
        name: tenantQuery.data.name,
        defaultLanguage: (tenantQuery.data.defaultLanguage as 'uz' | 'ru') ?? 'uz',
      });
    }
  }, [tenantQuery.data]);

  const updateMut = useMutation({
    mutationFn: api.tenant.update,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tenant'] }),
  });

  if (tenantQuery.isLoading) return <Loader />;

  const tenant = tenantQuery.data;

  return (
    <Container size="md">
      <Stack gap="lg">
        <Title order={2}>{t('nav.tenant_settings')}</Title>

        {!hasPermission('tenant.edit') && (
          <Alert color="yellow" variant="light">
            {t('tenant_settings.readonly_notice')}
          </Alert>
        )}

        <Card withBorder padding="lg" radius="md">
          <Stack gap="md">
            <Group justify="space-between">
              <Stack gap={2}>
                <Text size="sm" c="dimmed">
                  {t('tenant_settings.slug')}
                </Text>
                <Text fw={600}>{tenant?.slug ?? '—'}</Text>
              </Stack>
              <Badge color={tenant?.subscriptionStatus === 'active' ? 'teal' : 'yellow'}>
                {tenant?.subscriptionStatus}
              </Badge>
            </Group>

            <form onSubmit={form.onSubmit((values) => updateMut.mutate(values))}>
              <Stack gap="md">
                <TextInput
                  label={t('tenant_settings.name')}
                  required
                  disabled={!hasPermission('tenant.edit')}
                  {...form.getInputProps('name')}
                />
                <Select
                  label={t('tenant_settings.default_language')}
                  data={[
                    { value: 'uz', label: "O'zbek" },
                    { value: 'ru', label: 'Русский' },
                  ]}
                  disabled={!hasPermission('tenant.edit')}
                  {...form.getInputProps('defaultLanguage')}
                />
                {hasPermission('tenant.edit') && (
                  <Group justify="flex-end">
                    <Button type="submit" loading={updateMut.isPending}>
                      {t('common.save')}
                    </Button>
                  </Group>
                )}
              </Stack>
            </form>
          </Stack>
        </Card>
      </Stack>
    </Container>
  );
}
