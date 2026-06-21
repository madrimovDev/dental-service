import {
  Alert,
  Anchor,
  Button,
  Container,
  Paper,
  PasswordInput,
  Stack,
  TextInput,
  Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import type { TFunction } from 'i18next';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { PhoneInput } from '@/components/PhoneInput.tsx';
import { usePasswordReset } from '../auth.api';

// Telefon raqamга bog'langan reset (CLI-226 ATO fix) — token endi userId'ga bog'langan,
// shu sabab foydalanuvchi telefon raqamini ham kiritadi.
const makeSchema = (t: TFunction) =>
  z.object({
    phone: z.string().regex(/^\+?\d{9,15}$/, t('validation.phone_invalid')),
    token: z.string().min(1),
    newPassword: z.string().min(12),
  });

export function ResetPasswordPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  const form = useForm({
    initialValues: { phone: '', token: '', newPassword: '' },
    validate: zod4Resolver(makeSchema(t)),
  });

  const mut = usePasswordReset({
    onSuccess: () => navigate('/login'),
    onError: () => setError(t('auth.reset.invalid')),
  });

  return (
    <Container size={420} py={80}>
      <Title order={2} ta="center" mb="lg">
        {t('app.name')}
      </Title>
      <Paper withBorder shadow="md" p="xl" radius="md">
        <form
          onSubmit={form.onSubmit((values) => {
            setError(null);
            mut.mutate(values);
          })}
        >
          <Stack gap="md">
            <Title order={3}>{t('auth.reset.title')}</Title>

            {error && (
              <Alert color="red" variant="light">
                {error}
              </Alert>
            )}

            <PhoneInput label={t('auth.login.phone')} required {...form.getInputProps('phone')} />
            <TextInput
              label={t('auth.reset.code')}
              description={t('auth.reset.code_hint')}
              required
              {...form.getInputProps('token')}
            />
            <PasswordInput
              label={t('auth.reset.new_password')}
              placeholder={t('auth.reset.password_placeholder')}
              required
              {...form.getInputProps('newPassword')}
            />

            <Button type="submit" loading={mut.isPending} fullWidth>
              {t('auth.reset.submit')}
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
