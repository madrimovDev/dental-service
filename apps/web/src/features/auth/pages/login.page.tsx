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
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { PhoneInput } from '@/components/PhoneInput.tsx';
import { useAuthStore } from '@/stores/auth-store.ts';
import { useBootstrapStatus, useLogin, useRegistrationEnabled } from '../auth.api';

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

  // Audit C1 — `.lic` bor, lekin lokal bazada tenant yo'q (baza yo'qolgan /
  // yangi kompyuter). Bunda login HAR DOIM 401 beradi va foydalanuvchi
  // sababni bilmaydi. `/activate` sahifasi holatni o'zi aniqlab "vendorga
  // murojaat" matnini ko'rsatadi (yangi route qo'shilmaydi).
  //
  // FAIL-OPEN: `data` undefined bo'lsa (xato / eski backend) yo'naltirilmaydi.
  //
  // ⚠️ `hasLicense === true` SHARTI MAJBURIY (verify bosqichida topildi).
  // Faqat `hasTenant === false` ga qarasak, YANGI cloud/dev o'rnatmasi
  // (litsenziya YO'Q + hali birorta tenant yo'q) ham `/login`dan `/activate`ga
  // uloqtirilardi va shu sahifadagi `/register-tenant` havolasi navigatsiya
  // orqali yetib bo'lmas bo'lib qolardi — birinchi tenantni ro'yxatdan
  // o'tkazish oqimi buzilardi (`registration-enabled` cloud'da `true`).
  // Litsenziyasiz DESKTOP holati bundan zarar ko'rmaydi: Electron
  // `licenseGatedUrl()` (`apps/desktop/src/license-status.ts`) `.lic` yo'q
  // bo'lsa brauzerni allaqachon to'g'ridan-to'g'ri `/activate`ga ochadi.
  const bootstrap = useBootstrapStatus();
  const needsActivation =
    bootstrap.data?.hasLicense === true && bootstrap.data?.hasTenant === false;
  useEffect(() => {
    if (needsActivation) {
      navigate('/activate', { replace: true });
    }
  }, [needsActivation, navigate]);

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
