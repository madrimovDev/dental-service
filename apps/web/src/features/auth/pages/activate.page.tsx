import { Alert, Button, Container, Paper, Text, TextInput, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useMutation } from '@tanstack/react-query';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { useBootstrapStatus } from '../auth.api';

type ActivateResponse =
  // `ownerPhone` — kirish uchun telefon. Provisioning bloki kelgan har qanday
  // holatda qaytadi: hisob shu aktivatsiyada yaratilgan bo'lsa — vendor
  // blokidan, avvaldan bor bo'lsa — LOKAL bazadagi mavjud owner'niki (M1).
  //
  // `provisioned` — vendor bergan vaqtinchalik parol qo'llandimi. `false`
  // (idempotent skip) bo'lsa mijozning AVVALGI paroli kuchda qoladi, shuning
  // uchun "parolni yetkazib beruvchidan oling" maslahati ko'rsatilmaydi.
  // `undefined` — provisioning bloki umuman kelmagan (litsenziya yangilash).
  | {
      success: true;
      data: {
        modules: string[];
        expiresAt: string;
        ownerPhone?: string;
        provisioned?: boolean;
      };
    }
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
  // `null` — provisioning bloki kelmagan; aks holda vendor paroli
  // qo'llandimi (`false` = idempotent skip, avvalgi parol kuchda).
  const [provisioned, setProvisioned] = useState<boolean | null>(null);

  // Audit C1 — `.lic` bor, lekin lokal bazada tenant yo'q (baza yo'qolgan /
  // yangi kompyuter). Kalitni QAYTA kiritish bu holatni tuzatmaydi: Supervisor
  // litsenziyani eski fingerprint'ga bog'lab qo'ygan va javobda provisioning
  // bloki bo'lmaydi. Yagona yo'l — vendor "qayta o'rnatishga tayyorlash"ni
  // bajarishi. Shuning uchun forma umuman ko'rsatilmaydi.
  //
  // FAIL-OPEN: so'rov xato bersa yoki eski backend endpointni bilmasa
  // (`data` undefined) forma KO'RINADI — aks holda tarmoq xatosi mijozni
  // aktivatsiyadan butunlay mahrum qilardi.
  const bootstrap = useBootstrapStatus();
  const needsVendor = bootstrap.data?.hasLicense === true && bootstrap.data?.hasTenant === false;

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
        setProvisioned(res.data.provisioned ?? null);
      } else {
        setSuccess(false);
        setOwnerPhone(null);
        setProvisioned(null);
        setError(t(ERROR_KEY_MAP[res.error.code] ?? 'auth.activate.error_generic'));
      }
    },
    onError: () => {
      setSuccess(false);
      setOwnerPhone(null);
      setProvisioned(null);
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
      {needsVendor ? (
        <Paper withBorder shadow="md" p="xl" radius="md">
          <Title order={3} mb="xs">
            {t('auth.activate.needs_vendor_title')}
          </Title>
          <Text size="sm">{t('auth.activate.needs_vendor_body')}</Text>
        </Paper>
      ) : (
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
                    {/* Skip'da (`provisioned === false`) vendor bergan parol
                        QO'LLANMAGAN — mijozni undan parol so'rashga
                        yo'llamaymiz. Eski backend `provisioned` yubormasa
                        (`null`) mavjud matn saqlanadi. */}
                    {provisioned === false
                      ? t('auth.activate.login_hint_existing', { phone: ownerPhone })
                      : t('auth.activate.login_hint', { phone: ownerPhone })}
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
      )}
    </Container>
  );
}
