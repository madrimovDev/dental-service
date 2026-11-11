import { ApiError } from '@dental/api-client';
import { AlertBanner, Card } from '@dental/ui';
import { Button, Container, PasswordInput, Stack, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import type { TFunction } from 'i18next';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { useChangePassword } from '@/features/profile/profile.api';
import { useAuthStore } from '@/stores/auth-store.ts';

// Qoidalar profil sahifasidagi changePassword schema'si bilan bir xil (min 12, max 128).
const makeSchema = (t: TFunction) =>
  z
    .object({
      currentPassword: z.string().min(1, t('validation.required')),
      newPassword: z
        .string()
        .min(12, t('validation.min_chars', { count: 12 }))
        .max(128),
      confirmPassword: z.string().min(1, t('validation.required')),
    })
    .refine((d) => d.newPassword === d.confirmPassword, {
      message: t('auth.pwdChangeRequired.mismatch'),
      path: ['confirmPassword'],
    })
    .refine((d) => d.newPassword !== d.currentPassword, {
      message: t('auth.pwdChangeRequired.same'),
      path: ['newPassword'],
    });

export function ChangePasswordRequiredPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { clear } = useAuthStore();

  const form = useForm({
    initialValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
    validate: zod4Resolver(makeSchema(t)),
  });

  const changeMut = useChangePassword({
    onSuccess: () => {
      notifications.show({
        title: t('auth.pwdChangeRequired.title'),
        message: t('auth.pwdChangeRequired.success'),
        color: 'teal',
      });
      // Barcha refresh tokenlar bekor qilingan — qayta login.
      clear();
      navigate('/login', { replace: true });
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code === 'auth.invalid_current_password') {
        form.setFieldError('currentPassword', t('auth.pwdChangeRequired.invalid_current'));
        return;
      }
      notifications.show({
        title: t('common.error'),
        message: err.message,
        color: 'red',
      });
    },
  });

  return (
    <Container size={420} py={80}>
      <Title order={2} ta="center" mb="lg">
        {t('app.name')}
      </Title>
      <Card>
        <form
          onSubmit={form.onSubmit((v) =>
            changeMut.mutate({ currentPassword: v.currentPassword, newPassword: v.newPassword }),
          )}
        >
          <Stack gap="md">
            <Title order={3}>{t('auth.pwdChangeRequired.title')}</Title>
            <AlertBanner tier={2}>{t('auth.pwdChangeRequired.description')}</AlertBanner>
            <PasswordInput
              label={t('auth.pwdChangeRequired.current')}
              autoComplete="current-password"
              required
              {...form.getInputProps('currentPassword')}
            />
            <PasswordInput
              label={t('auth.pwdChangeRequired.new_password')}
              description={t('auth.pwdChangeRequired.hint')}
              autoComplete="new-password"
              required
              {...form.getInputProps('newPassword')}
            />
            <PasswordInput
              label={t('auth.pwdChangeRequired.confirm')}
              autoComplete="new-password"
              required
              {...form.getInputProps('confirmPassword')}
            />
            <Button type="submit" loading={changeMut.isPending} fullWidth>
              {t('auth.pwdChangeRequired.submit')}
            </Button>
          </Stack>
        </form>
      </Card>
    </Container>
  );
}
