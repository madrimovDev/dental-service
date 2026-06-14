import {
  Alert,
  Anchor,
  Button,
  Container,
  Paper,
  PasswordInput,
  Select,
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
import { useRegisterTenant } from '../auth.api';

const makeSchema = (t: TFunction) =>
  z.object({
    tenantName: z
      .string()
      .min(2, t('validation.min_chars', { count: 2 }))
      .max(120),
    ownerPhone: z.string().regex(/^\+?\d{9,15}$/, t('validation.phone_invalid')),
    ownerFullName: z
      .string()
      .min(2, t('validation.min_chars', { count: 2 }))
      .max(120),
    ownerPassword: z.string().min(12, t('validation.min_chars', { count: 12 })),
    defaultLanguage: z.enum(['uz', 'ru']),
  });

type FormValues = z.infer<ReturnType<typeof makeSchema>>;

export function RegisterTenantPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    initialValues: {
      tenantName: '',
      ownerPhone: '',
      ownerFullName: '',
      ownerPassword: '',
      defaultLanguage: 'uz',
    },
    validate: zod4Resolver(makeSchema(t)),
  });

  const registerMut = useRegisterTenant({
    onSuccess: () => {
      navigate('/login');
    },
    onError: (err) => {
      if (err.code === 'auth.phone_taken' || err.code === 'auth.email_or_phone_taken') {
        setError(t('auth.register.phone_taken'));
      } else {
        setError(err.message);
      }
    },
  });

  return (
    <Container size={520} py={60}>
      <Title order={2} ta="center" mb="lg">
        {t('app.name')}
      </Title>
      <Paper withBorder shadow="md" p="xl" radius="md">
        <form
          onSubmit={form.onSubmit((values) => {
            setError(null);
            registerMut.mutate(values);
          })}
        >
          <Stack gap="md">
            <Title order={3}>{t('auth.register.title')}</Title>

            {error && (
              <Alert color="red" variant="light">
                {error}
              </Alert>
            )}

            <TextInput
              label={t('auth.register.clinic_name')}
              placeholder={t('auth.register.clinic_name_placeholder')}
              required
              {...form.getInputProps('tenantName')}
            />
            <TextInput
              label={t('auth.register.owner_full_name')}
              placeholder={t('auth.register.owner_name_placeholder')}
              required
              {...form.getInputProps('ownerFullName')}
            />
            <PhoneInput
              label={t('auth.register.phone')}
              required
              {...form.getInputProps('ownerPhone')}
            />
            <PasswordInput
              label={t('auth.register.password')}
              placeholder={t('auth.register.password_hint')}
              description={t('auth.register.password_hint')}
              required
              {...form.getInputProps('ownerPassword')}
            />
            <Select
              label={t('auth.register.language')}
              data={[
                { value: 'uz', label: "O'zbek" },
                { value: 'ru', label: 'Русский' },
              ]}
              {...form.getInputProps('defaultLanguage')}
            />

            <Button type="submit" loading={registerMut.isPending} fullWidth size="md">
              {t('auth.register.submit')}
            </Button>

            <Anchor component={Link} to="/login" size="sm" ta="center">
              {t('auth.register.have_account')}
            </Anchor>
          </Stack>
        </form>
      </Paper>
    </Container>
  );
}
