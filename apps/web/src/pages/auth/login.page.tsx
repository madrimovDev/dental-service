import type { ApiError } from '@dental/api-client';
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
import { useMutation } from '@tanstack/react-query';
import { zodResolver } from 'mantine-form-zod-resolver';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { api } from '@/lib/api.ts';
import { useAuthStore } from '@/stores/auth-store.ts';

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
    validate: zodResolver(schema),
  });

  const loginMut = useMutation({
    mutationFn: api.auth.login,
    onSuccess: async (data) => {
      setTokens(data.accessToken, data.refreshToken);
      setUser(data.user);
      // After login, check memberships and route appropriately
      navigate('/select-workspace');
    },
    onError: (err: ApiError) => {
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

            <TextInput
              label={t('auth.login.phone')}
              placeholder="+998 90 123 45 67"
              autoComplete="tel"
              required
              {...form.getInputProps('phone')}
            />
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
