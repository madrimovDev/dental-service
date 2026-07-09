import type { TenantSettings } from '@dental/api-client';
import { StatusPill } from '@dental/ui';
import {
  Button,
  Group,
  Loader,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import {
  type Icon,
  IconBrandTelegram,
  IconFileSpreadsheet,
  IconMessage,
  IconReceiptTax,
} from '@tabler/icons-react';
import type { TFunction } from 'i18next';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/auth-store.ts';
import { useTenantSettings, useTestIntegration, useUpdateTenantSettings } from '../settings.api';
import {
  type EskizIntegrationFormValues,
  eskizIntegrationSchema,
  type TelegramIntegrationFormValues,
  telegramIntegrationSchema,
} from '../settings.schema';
import { DesktopServerConnectionCard } from './DesktopServerConnectionCard';
import { SettingsShell } from './SettingsShell';

/**
 * Integratsiya kartalari. Holat (`connected`) backend
 * `tenant_settings.integration_settings` JSONB'dan o'qiladi (GET): `telegram`/`sms`
 * (Eskiz) provayderlari uchun maskalangan `configured` (CLI-379/400 — xom kredensial
 * hech qachon qaytarilmaydi, faqat "sozlangan/mi" + oxirgi belgilar hint). `soliq`/`onec`
 * hali backend-tomondan boshqarilmaydi (scaffold — Faza 3 jonli faollashtirish), shu
 * sabab doimo «Ulanmagan» va tugmalari disabled qoladi.
 *
 * Telegram/Eskiz — TASK 8: haqiqiy kredensial kartasi (bot token / email+parol +
 * «Tekshir» + «Saqlash»). `Tekshir` faqat test qiladi (hech narsa saqlamaydi,
 * `POST /tenant-settings/integrations/test`); `Saqlash` PATCH `/tenant-settings`
 * orqali AES bilan shifrlab saqlaydi (backend hech qachon xom qiymatni qaytarmaydi —
 * shu sabab forma har doim bo'sh boshlanadi, faqat badge+hint saqlangan holatni ko'rsatadi).
 */
const CARD_STYLE: React.CSSProperties = {
  borderRadius: 'var(--radius-card)',
  padding: 18,
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  boxShadow: 'var(--shadow-sm)',
};

function IconBadge({ icon: Icon }: { icon: Icon }) {
  return (
    <div
      style={{
        width: 40,
        height: 40,
        borderRadius: 10,
        background: 'var(--surface-2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--ink-2)',
        flexShrink: 0,
      }}
    >
      <Icon size={20} stroke={1.6} />
    </div>
  );
}

function showTestResultToast(t: TFunction, result: { ok: boolean; detail: string | null }) {
  notifications.show({
    color: result.ok ? 'teal' : 'red',
    message: result.ok
      ? result.detail
        ? t('settings.integration_test_success_detail', { detail: result.detail })
        : t('settings.integration_test_success')
      : t('settings.integration_test_failed'),
  });
}

/** Telegram/Eskiz kartalarining umumiy qobig'i — badge, hint, Tekshir/Saqlash tugmalari. */
function CredentialCard({
  icon,
  title,
  desc,
  configured,
  hint,
  disabled,
  testing,
  saving,
  onTest,
  onSave,
  children,
  testId,
}: {
  icon: Icon;
  title: string;
  desc: string;
  configured: boolean;
  hint: string | null;
  disabled: boolean;
  testing: boolean;
  saving: boolean;
  onTest: () => void;
  onSave: () => void;
  children: React.ReactNode;
  testId: string;
}) {
  const { t } = useTranslation();
  return (
    <div style={CARD_STYLE} data-testid={testId}>
      <Stack gap={14}>
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Group gap={12} align="center" wrap="nowrap">
            <IconBadge icon={icon} />
            <div>
              <Title order={4} fw={700} c="var(--ink)">
                {title}
              </Title>
              <Text size="xs" c="var(--ink-3)">
                {desc}
              </Text>
            </div>
          </Group>
          <StatusPill status={configured ? 'success' : 'neutral'}>
            {configured
              ? t('settings.integration_status_connected')
              : t('settings.integration_status_off')}
          </StatusPill>
        </Group>

        {configured && hint && (
          <Text size="xs" c="dimmed">
            {t('settings.integration_configured_hint', { hint })}
          </Text>
        )}

        <Stack gap={10}>{children}</Stack>

        <Group justify="flex-end" gap={8}>
          <Button
            variant="outline"
            size="xs"
            loading={testing}
            disabled={disabled}
            onClick={onTest}
          >
            {t('settings.integration_test_button')}
          </Button>
          <Button size="xs" loading={saving} disabled={disabled} onClick={onSave}>
            {t('common.save')}
          </Button>
        </Group>
      </Stack>
    </div>
  );
}

function TelegramCard({
  status,
  canEdit,
}: {
  status: TenantSettings['integrationSettings']['telegram'];
  canEdit: boolean;
}) {
  const { t } = useTranslation();
  const update = useUpdateTenantSettings();
  const test = useTestIntegration();
  const form = useForm<TelegramIntegrationFormValues>({
    initialValues: { botToken: '' },
    validate: zod4Resolver(telegramIntegrationSchema),
  });

  const handleTest = () => {
    if (form.validate().hasErrors) return;
    test.mutate(
      { target: 'telegram', telegram: { botToken: form.values.botToken } },
      { onSuccess: (result) => showTestResultToast(t, result) },
    );
  };

  const handleSave = () => {
    if (form.validate().hasErrors) return;
    update.mutate({ telegram: { botToken: form.values.botToken } });
  };

  return (
    <CredentialCard
      testId="telegram-integration-card"
      icon={IconBrandTelegram}
      title={t('settings.integration_telegram_name')}
      desc={t('settings.integration_telegram_desc')}
      configured={status.configured}
      hint={status.hint}
      disabled={!canEdit}
      testing={test.isPending}
      saving={update.isPending}
      onTest={handleTest}
      onSave={handleSave}
    >
      <PasswordInput
        label={t('settings.integration_telegram_bot_token_label')}
        placeholder={t('settings.integration_telegram_bot_token_placeholder')}
        disabled={!canEdit}
        {...form.getInputProps('botToken')}
      />
    </CredentialCard>
  );
}

function EskizCard({
  status,
  canEdit,
}: {
  status: TenantSettings['integrationSettings']['sms'];
  canEdit: boolean;
}) {
  const { t } = useTranslation();
  const update = useUpdateTenantSettings();
  const test = useTestIntegration();
  const form = useForm<EskizIntegrationFormValues>({
    initialValues: { eskizEmail: '', eskizPassword: '' },
    validate: zod4Resolver(eskizIntegrationSchema),
  });

  const handleTest = () => {
    if (form.validate().hasErrors) return;
    test.mutate(
      {
        target: 'sms',
        sms: { eskizEmail: form.values.eskizEmail, eskizPassword: form.values.eskizPassword },
      },
      { onSuccess: (result) => showTestResultToast(t, result) },
    );
  };

  const handleSave = () => {
    if (form.validate().hasErrors) return;
    update.mutate({
      sms: { eskizEmail: form.values.eskizEmail, eskizPassword: form.values.eskizPassword },
    });
  };

  return (
    <CredentialCard
      testId="eskiz-integration-card"
      icon={IconMessage}
      title={t('settings.integration_eskiz_name')}
      desc={t('settings.integration_eskiz_desc')}
      configured={status.configured}
      hint={status.hint}
      disabled={!canEdit}
      testing={test.isPending}
      saving={update.isPending}
      onTest={handleTest}
      onSave={handleSave}
    >
      <TextInput
        label={t('settings.integration_eskiz_email_label')}
        disabled={!canEdit}
        {...form.getInputProps('eskizEmail')}
      />
      <PasswordInput
        label={t('settings.integration_eskiz_password_label')}
        disabled={!canEdit}
        {...form.getInputProps('eskizPassword')}
      />
    </CredentialCard>
  );
}

/** Hali backend-tomondan boshqarilmaydigan integratsiyalar (scaffold, doim «Ulanmagan»). */
type ScaffoldCard = { id: string; nameKey: string; descKey: string; icon: Icon };

const SCAFFOLD_CARDS: ScaffoldCard[] = [
  {
    id: 'soliq',
    nameKey: 'settings.integration_soliq_name',
    descKey: 'settings.integration_soliq_desc',
    icon: IconReceiptTax,
  },
  {
    id: 'onec',
    nameKey: 'settings.integration_onec_name',
    descKey: 'settings.integration_onec_desc',
    icon: IconFileSpreadsheet,
  },
];

export function IntegrationsSettingsScreen() {
  const { t } = useTranslation();
  const { hasPermission } = useAuthStore();
  const settings = useTenantSettings();
  const integrations = settings.data?.integrationSettings;
  const canEdit = hasPermission('tenant_settings.edit');

  return (
    <SettingsShell active="integrations">
      <DesktopServerConnectionCard />
      {settings.isLoading || !integrations ? (
        <div style={{ padding: 24 }}>
          <Loader size="sm" />
        </div>
      ) : (
        <Stack gap={14}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: 14,
            }}
          >
            <TelegramCard status={integrations.telegram} canEdit={canEdit} />
            <EskizCard status={integrations.sms} canEdit={canEdit} />
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: 14,
            }}
          >
            {SCAFFOLD_CARDS.map((card) => {
              const Icon = card.icon;
              return (
                <div
                  key={card.id}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                    borderRadius: 'var(--radius-card)',
                    padding: 18,
                    border: '1px solid var(--border)',
                    background: 'var(--surface)',
                    boxShadow: 'var(--shadow-sm)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                    }}
                  >
                    <IconBadge icon={Icon} />
                    <StatusPill status="neutral">{t('settings.integration_status_off')}</StatusPill>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <Title order={4} fw={700} c="var(--ink)">
                      {t(card.nameKey)}
                    </Title>
                    <span style={{ fontSize: 12.5, color: 'var(--ink-3)', lineHeight: 1.4 }}>
                      {t(card.descKey)}
                    </span>
                  </div>

                  <Tooltip label={t('shell.coming_soon')}>
                    <span style={{ alignSelf: 'flex-start' }}>
                      <Button
                        size="xs"
                        disabled
                        style={{
                          background: 'var(--primary)',
                          color: 'var(--on-primary)',
                        }}
                      >
                        {t('settings.integration_connect')}
                      </Button>
                    </span>
                  </Tooltip>
                </div>
              );
            })}
          </div>
        </Stack>
      )}
    </SettingsShell>
  );
}
