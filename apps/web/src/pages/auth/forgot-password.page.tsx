import { Alert, Anchor, Button, Container, Paper, Stack, TextInput, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useMutation } from '@tanstack/react-query';
import { zodResolver } from 'mantine-form-zod-resolver';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { api } from '@/lib/api.ts';

const schema = z.object({
  phone: z.string().regex(/^\+?\d{9,15}$/, "Telefon raqami noto'g'ri formatda"),
});

export function ForgotPasswordPage() {
  const { t } = useTranslation();
  const form = useForm({
    initialValues: { phone: '' },
    validate: zodResolver(schema),
  });

  const mut = useMutation({
    mutationFn: (v: { phone: string }) => api.auth.requestPasswordReset(v.phone),
  });

  return (
    <Container size={420} py={80}>
      <Title order={2} ta="center" mb="lg">
        {t('app.name')}
      </Title>
      <Paper withBorder shadow="md" p="xl" radius="md">
        <form onSubmit={form.onSubmit((values) => mut.mutate(values))}>
          <Stack gap="md">
            <Title order={3}>{t('auth.forgot.title')}</Title>

            {mut.isSuccess && (
              <Alert color="teal" variant="light">
                {t('auth.forgot.sent')}
                <br />
                <strong>{t('auth.forgot.mock_otp_notice')}</strong>
              </Alert>
            )}

            <TextInput
              label={t('auth.login.phone')}
              placeholder="+998 90 123 45 67"
              autoComplete="tel"
              required
              {...form.getInputProps('phone')}
            />

            <Button type="submit" loading={mut.isPending} fullWidth>
              {t('auth.forgot.submit')}
            </Button>

            <Anchor component={Link} to="/login" size="sm" ta="center">
              {t('auth.forgot.back_to_login')}
            </Anchor>
          </Stack>
        </form>
      </Paper>
    </Container>
  );
}
