import { ApiError } from '@dental/api-client';
import {
  Alert,
  Button,
  Container,
  Group,
  Paper,
  PasswordInput,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { IconLock, IconUser } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { api } from '@/lib/api.ts';
import { useAuthStore } from '@/stores/auth-store.ts';

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(12).max(128),
    confirmPassword: z.string().min(1),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'passwords_not_match',
    path: ['confirmPassword'],
  });

export function ProfilePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, clear } = useAuthStore();

  const form = useForm({
    initialValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
    validate: zod4Resolver(passwordSchema),
  });

  const changeMut = useMutation({
    mutationFn: (values: typeof form.values) =>
      api.auth.changePassword(values.currentPassword, values.newPassword),
    onSuccess: () => {
      notifications.show({
        title: t('profile.title'),
        message: t('profile.password_changed'),
        color: 'teal',
      });
      // Parol o'zgartirilgach barcha refresh tokenlar revoked — qayta login
      clear();
      navigate('/login', { replace: true });
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        if (err.code === 'auth.invalid_current_password') {
          form.setFieldError('currentPassword', t('profile.invalid_current'));
          return;
        }
        if (err.code === 'auth.same_password') {
          form.setFieldError('newPassword', t('profile.same_password'));
          return;
        }
        notifications.show({
          title: t('common.error'),
          message: err.message,
          color: 'red',
        });
      }
    },
  });

  return (
    <Container size="sm">
      <Stack gap="lg">
        <Group>
          <IconUser size={24} />
          <Title order={2}>{t('profile.title')}</Title>
        </Group>

        <Paper withBorder p="lg" radius="md">
          <Stack gap="md">
            <Group>
              <Text fw={600}>{user?.fullName ?? user?.phone}</Text>
            </Group>
            <Text size="sm" c="dimmed">
              {user?.phone}
            </Text>
          </Stack>
        </Paper>

        <Paper withBorder p="lg" radius="md">
          <form onSubmit={form.onSubmit((values) => changeMut.mutate(values))}>
            <Stack gap="md">
              <Group>
                <IconLock size={20} />
                <Title order={4}>{t('profile.change_password')}</Title>
              </Group>

              <Alert color="yellow" variant="light">
                <Text size="sm">{t('profile.change_password_warning')}</Text>
              </Alert>

              <PasswordInput
                label={t('profile.current_password')}
                required
                {...form.getInputProps('currentPassword')}
              />
              <PasswordInput
                label={t('profile.new_password')}
                description={t('profile.new_password_hint')}
                required
                {...form.getInputProps('newPassword')}
              />
              <PasswordInput
                label={t('profile.confirm_password')}
                required
                error={
                  form.errors.confirmPassword === 'passwords_not_match'
                    ? t('profile.passwords_not_match')
                    : form.errors.confirmPassword
                }
                {...form.getInputProps('confirmPassword')}
              />

              <Group justify="flex-end">
                <Button type="submit" loading={changeMut.isPending}>
                  {t('profile.save')}
                </Button>
              </Group>
            </Stack>
          </form>
        </Paper>
      </Stack>
    </Container>
  );
}
