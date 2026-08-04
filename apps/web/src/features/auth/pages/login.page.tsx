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
import type { TFunction } from 'i18next';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { PhoneInput } from '@/components/PhoneInput.tsx';
import { useAuthStore } from '@/stores/auth-store.ts';
import { useLogin, useRegistrationEnabled } from '../auth.api';

const makeSchema = (t: TFunction) =>
  z.object({
    phone: z.string().regex(/^\+?\d{9,15}$/, t('validation.phone_invalid')),
    password: z.string().min(1, t('validation.password_required')),
  });

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const { setTokens, setUser } = useAuthStore();

  const form = useForm({
    initialValues: { phone: '', password: '' },
    validate: zod4Resolver(makeSchema(t)),
  });

  // Server-tomon signali — `RegisterTenantPage` darvozasi bilan AYNI semantika.
  // Sabab: `window.dentalDesktop` faqat Electron oynasida mavjud; klinika
  // xodimi desktop serverga LAN orqali BRAUZERdan kirsa u yo'q, va havola
  // ko'rinib qolardi (bosilganda sahifa /login'ga qaytaradi — foydasiz sayr).
  const registration = useRegistrationEnabled();

  const loginMut = useLogin({
    onSuccess: (data) => {
      setTokens(data.accessToken, data.refreshToken);
      setUser(data.user);
      // After login, check memberships and route appropriately
      navigate('/select-workspace');
    },
    onError: (err) => {
      setError(
        err.code === 'auth.invalid_credentials' ? t('auth.login.invalid_credentials') : err.message,
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
              <Anchor component={Link} to="/reset-owner-password" size="sm">
                {t('auth.login.reset_owner')}
              </Anchor>
              {/* Fail-open (`!== false`): javob kelmasa yoki eski backend
                  endpointni bilmasa havola KO'RINADI — cloud foydalanuvchisidan
                  ro'yxatdan o'tish imkoniyati tortib olinmaydi. */}
              {(typeof window === 'undefined' || !window.dentalDesktop) &&
                registration.data?.enabled !== false && (
                  <Anchor component={Link} to="/register-tenant" size="sm">
                    {t('auth.login.register_clinic')}
                  </Anchor>
                )}
            </Stack>
          </Stack>
        </form>
      </Paper>
    </Container>
  );
}
