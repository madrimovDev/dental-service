import type { ApiError } from '@dental/api-client';
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
import { useMutation } from '@tanstack/react-query';
import { zodResolver } from 'mantine-form-zod-resolver';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { api } from '@/lib/api.ts';

const schema = z.object({
  tenantName: z.string().min(2, 'Kamida 2 belgi').max(120),
  ownerPhone: z.string().regex(/^\+?\d{9,15}$/, "Telefon raqami noto'g'ri formatda"),
  ownerFullName: z.string().min(2, 'Kamida 2 belgi').max(120),
  ownerPassword: z.string().min(12, 'Kamida 12 belgi'),
  defaultLanguage: z.enum(['uz', 'ru']),
});

type FormValues = z.infer<typeof schema>;

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
    validate: zodResolver(schema),
  });

  const registerMut = useMutation({
    mutationFn: (values: FormValues) =>
      api.auth.registerTenant({
        tenantName: values.tenantName,
        ownerPhone: values.ownerPhone,
        ownerFullName: values.ownerFullName,
        ownerPassword: values.ownerPassword,
        defaultLanguage: values.defaultLanguage,
      }),
    onSuccess: () => {
      navigate('/login');
    },
    onError: (err: ApiError) => {
      if (err.code === 'auth.phone_taken' || err.code === 'auth.email_or_phone_taken') {
        setError("Bu telefon raqami allaqachon ro'yxatdan o'tgan");
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
              placeholder="Mening klinika"
              required
              {...form.getInputProps('tenantName')}
            />
            <TextInput
              label={t('auth.register.owner_full_name')}
              placeholder="Aliyev Aziz"
              required
              {...form.getInputProps('ownerFullName')}
            />
            <TextInput
              label={t('auth.register.phone')}
              placeholder="+998 90 123 45 67"
              autoComplete="tel"
              required
              {...form.getInputProps('ownerPhone')}
            />
            <PasswordInput
              label={t('auth.register.password')}
              placeholder="Kamida 12 belgi"
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
