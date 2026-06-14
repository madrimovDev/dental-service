import {
  Alert,
  Anchor,
  Button,
  Container,
  Paper,
  PasswordInput,
  Stack,
  Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { PhoneInput } from '@/components/PhoneInput.tsx';
import { useAuthStore } from '@/stores/auth-store.ts';
import { useLogin } from '../auth.api';

const schema = z.object({
  phone: z.string().regex(/^\+?\d{9,15}$/, "Telefon raqami noto'g'ri formatda"),
  password: z.string().min(1, 'Parol kerak'),
});

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const { setTokens, setUser } = useAuthStore();

  const form = useForm({
    initialValues: { phone: '', password: '' },
    validate: zod4Resolver(schema),
  });

  const loginMut = useLogin({
    onSuccess: (data) => {
      setTokens(data.accessToken, data.refreshToken);
      setUser(data.user);
      // After login, check memberships and route appropriately
      navigate('/select-workspace');
    },
    onError: (err) => {
      setError(
        err.code === 'auth.invalid_credentials' ? "Telefon yoki parol noto'g'ri" : err.message,
      );
    },
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
            loginMut.mutate(values);
          })}
        >
          <Stack gap="md">
            <Title order={3}>{t('auth.login.title')}</Title>

            {error && (
              <Alert color="red" variant="light">
                {error}
              </Alert>
            )}

            <PhoneInput label={t('auth.login.phone')} required {...form.getInputProps('phone')} />
            <PasswordInput
              label={t('auth.login.password')}
              placeholder="••••••••"
              autoComplete="current-password"
              required
              {...form.getInputProps('password')}
            />

            <Button type="submit" loading={loginMut.isPending} fullWidth>
              {t('auth.login.submit')}
            </Button>

            <Stack gap={4} align="center">
              <Anchor component={Link} to="/forgot-password" size="sm">
                {t('auth.login.forgot')}
              </Anchor>
              <Anchor component={Link} to="/register-tenant" size="sm">
                {t('auth.login.register_clinic')}
              </Anchor>
            </Stack>
          </Stack>
        </form>
      </Paper>
    </Container>
  );
}
