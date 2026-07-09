import {
  Alert,
  Anchor,
  Button,
  Container,
  Paper,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { useMutation } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { z } from 'zod';

type ResetOwnerPasswordResponse =
  | { success: true; data: { success: true } }
  | { success: false; error: { code: string; message: string } };

// Hand-written raw fetch (not through generated api-client) — same reasoning
// as activate.page.tsx: this endpoint runs pre-login (owner has no working
// password), so it can't go through the authenticated client.
async function resetOwnerPassword(
  resetToken: string,
  newPassword: string,
): Promise<ResetOwnerPasswordResponse> {
  const baseUrl = import.meta.env.VITE_API_BASE_URL ?? '';
  const res = await fetch(`${baseUrl}/api/reset-owner-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resetToken, newPassword }),
  });
  return res.json() as Promise<ResetOwnerPasswordResponse>;
}

const TOKEN_REGEX = /^[0-9A-Fa-f]{5}-[0-9A-Fa-f]{5}-[0-9A-Fa-f]{5}$/;

const makeSchema = (t: TFunction) =>
  z
    .object({
      resetToken: z.string().regex(TOKEN_REGEX, t('auth.reset_owner.token_invalid')),
      newPassword: z.string().min(8, t('validation.min_chars', { count: 8 })),
      confirmPassword: z.string().min(1, t('validation.required')),
    })
    .refine((data) => data.newPassword === data.confirmPassword, {
      message: 'passwords_not_match',
      path: ['confirmPassword'],
    });

const ERROR_KEY_MAP: Record<string, string> = {
  'reset.invalid_token': 'auth.reset_owner.error_invalid_token',
  'reset.no_tenant': 'auth.reset_owner.error_generic',
};

export function ResetOwnerPasswordPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  const form = useForm({
    initialValues: { resetToken: '', newPassword: '', confirmPassword: '' },
    validate: zod4Resolver(makeSchema(t)),
  });

  const resetMut = useMutation({
    mutationFn: (values: { resetToken: string; newPassword: string }) =>
      resetOwnerPassword(values.resetToken.toUpperCase(), values.newPassword),
    onSuccess: (res) => {
      if (res.success) {
        setError(null);
        notifications.show({
          title: t('auth.reset_owner.title'),
          message: t('auth.reset_owner.success'),
          color: 'teal',
        });
        navigate('/login');
      } else {
        setError(t(ERROR_KEY_MAP[res.error.code] ?? 'auth.reset_owner.error_generic'));
      }
    },
    onError: () => setError(t('auth.reset_owner.error_generic')),
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
            resetMut.mutate(values);
          })}
        >
          <Stack gap="md">
            <Title order={3}>{t('auth.reset_owner.title')}</Title>
            <Text size="sm" c="dimmed">
              {t('auth.reset_owner.description')}
            </Text>

            {error && (
              <Alert color="red" variant="light">
                {error}
              </Alert>
            )}

            <TextInput
              label={t('auth.reset_owner.token')}
              description={t('auth.reset_owner.token_hint')}
              placeholder="XXXXX-XXXXX-XXXXX"
              required
              {...form.getInputProps('resetToken')}
            />
            <PasswordInput
              label={t('auth.reset_owner.new_password')}
              placeholder={t('auth.reset_owner.password_placeholder')}
              required
              {...form.getInputProps('newPassword')}
            />
            <PasswordInput
              label={t('auth.reset_owner.confirm_password')}
              required
              {...form.getInputProps('confirmPassword')}
              // getInputProps('confirmPassword') o'zining `error`ini beradi
              // (xom `passwords_not_match` kaliti) — shuning uchun override
              // spread'dan KEYIN kelishi kerak, aks holda tarjima ko'rinmaydi.
              error={
                form.errors.confirmPassword === 'passwords_not_match'
                  ? t('auth.reset_owner.passwords_not_match')
                  : form.errors.confirmPassword
              }
            />

            <Button type="submit" loading={resetMut.isPending} fullWidth>
              {t('auth.reset_owner.submit')}
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
