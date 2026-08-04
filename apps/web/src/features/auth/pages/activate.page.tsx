import { Alert, Button, Container, Paper, Text, TextInput, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useMutation } from '@tanstack/react-query';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';

type ActivateResponse =
  // `ownerPhone` — Supervisor provisioning bloki bilan owner hisobi AYNAN SHU
  // aktivatsiyada yaratilgan bo'lsagina qaytadi (hisob avvaldan bor bo'lsa —
  // yo'q), shuning uchun ixtiyoriy.
  | { success: true; data: { modules: string[]; expiresAt: string; ownerPhone?: string } }
  | { success: false; error: { code: string; message: string } };

// Hand-written raw fetch (not through generated api-client) — this endpoint
// is deliberately excluded from the OpenAPI spec, same reasoning as
// `lib/api.ts`'s refreshTokens: it runs before any tenant/user JWT exists,
// so it can't go through the authenticated client.
async function activate(licenseKey: string): Promise<ActivateResponse> {
  const baseUrl = import.meta.env.VITE_API_BASE_URL ?? '';
  const res = await fetch(`${baseUrl}/api/activate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ licenseKey }),
  });
  return res.json() as Promise<ActivateResponse>;
}

const ERROR_KEY_MAP: Record<string, string> = {
  INVALID_KEY: 'auth.activate.error_invalid_key',
  FINGERPRINT_MISMATCH: 'auth.activate.error_fingerprint_mismatch',
  FINGERPRINT_UNAVAILABLE: 'auth.activate.error_fingerprint_unavailable',
};

export function ActivatePage() {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [ownerPhone, setOwnerPhone] = useState<string | null>(null);

  const schema = z.object({
    licenseKey: z.string().min(1, t('validation.required')),
  });

  const form = useForm({
    initialValues: { licenseKey: '' },
    validate: zod4Resolver(schema),
  });

  const activateMut = useMutation({
    mutationFn: (values: { licenseKey: string }) => activate(values.licenseKey),
    onSuccess: (res) => {
      if (res.success) {
        setError(null);
        setSuccess(true);
        setOwnerPhone(res.data.ownerPhone ?? null);
      } else {
        setSuccess(false);
        setOwnerPhone(null);
        setError(t(ERROR_KEY_MAP[res.error.code] ?? 'auth.activate.error_generic'));
      }
    },
    onError: () => {
      setSuccess(false);
      setOwnerPhone(null);
      setError(t('auth.activate.error_generic'));
    },
  });

  // Faollashtirish muvaffaqiyatli bo'lgach asosiy ilovaga o'tish — hard
  // reload (SPA navigate emas), chunki litsenziya holati serverda
  // saqlanadi, klient-tomon route guard'i yo'q.
  // Kechikish 4000 ms — foydalanuvchi kirish telefonini o'qib ulgursin.
  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => {
      window.location.href = '/login';
    }, 4000);
    return () => clearTimeout(timer);
  }, [success]);

  return (
    <Container size={420} py={80}>
      <Title order={2} ta="center" mb="lg">
        {t('app.name')}
      </Title>
      <Paper withBorder shadow="md" p="xl" radius="md">
        <form
          onSubmit={form.onSubmit((values) => {
            setError(null);
            activateMut.mutate(values);
          })}
        >
          <Title order={3} mb="xs">
            {t('auth.activate.title')}
          </Title>
          <Text size="sm" c="dimmed" mb="md">
            {t('auth.activate.description')}
          </Text>

          {error && (
            <Alert color="red" variant="light" mb="md">
              {error}
            </Alert>
          )}
          {success && (
            <Alert color="green" variant="light" mb="md">
              {t('auth.activate.success')}
              {ownerPhone && (
                <Text size="sm" mt="xs">
                  {t('auth.activate.login_hint', { phone: ownerPhone })}
                </Text>
              )}
            </Alert>
          )}

          <TextInput
            label={t('auth.activate.license_key')}
            placeholder={t('auth.activate.license_key_placeholder')}
            required
            disabled={success}
            {...form.getInputProps('licenseKey')}
            mb="md"
          />

          <Button type="submit" loading={activateMut.isPending} disabled={success} fullWidth>
            {t('auth.activate.submit')}
          </Button>
        </form>
      </Paper>
    </Container>
  );
}
