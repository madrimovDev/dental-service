import { ApiError } from '@dental/api-client';
import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Loader,
  Modal,
  NumberInput,
  PasswordInput,
  Select,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/auth-store.ts';
import {
  useTenant,
  useTenantSettings,
  useTransferOwnership,
  useUpdateTenant,
  useUpdateTenantSettings,
  useUsers,
} from '../settings.api';
import {
  type TenantFormValues,
  type TenantSettingsFormValues,
  type TransferFormValues,
  tenantSchema,
  tenantSettingsSchema,
  transferSchema,
} from '../settings.schema';
import { ConfirmModal } from './ConfirmModal';
import { SettingsShell } from './SettingsShell';

export function TenantSettingsScreen() {
  const { t } = useTranslation();
  const { hasPermission } = useAuthStore();
  const tenant = useTenant();
  const update = useUpdateTenant();
  const settings = useTenantSettings();
  const updateSettings = useUpdateTenantSettings();
  const transfer = useTransferOwnership();
  const users = useUsers();
  const canEditSettings = hasPermission('tenant_settings.edit');
  const [transferOpened, { open: openTransfer, close: closeTransfer }] = useDisclosure(false);
  const [confirmOpened, { open: openConfirm, close: closeConfirm }] = useDisclosure(false);

  const form = useForm<TenantFormValues>({
    initialValues: { name: '', defaultLanguage: 'uz' },
    validate: zod4Resolver(tenantSchema),
  });

  const settingsForm = useForm<TenantSettingsFormValues>({
    initialValues: { vertical: 'dental', currency: 'UZS', reminderLeadHours: 24 },
    validate: zod4Resolver(tenantSettingsSchema),
  });

  const transferForm = useForm<TransferFormValues>({
    initialValues: { newOwnerUserId: '', currentPassword: '' },
    validate: zod4Resolver(transferSchema),
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: form.setValues stable
  useEffect(() => {
    if (tenant.data) {
      form.setValues({
        name: tenant.data.name,
        defaultLanguage: (tenant.data.defaultLanguage as 'uz' | 'ru') ?? 'uz',
      });
    }
  }, [tenant.data]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: form.setValues stable
  useEffect(() => {
    if (settings.data) {
      settingsForm.setValues({
        vertical: (settings.data.vertical as 'dental') ?? 'dental',
        currency: settings.data.currency ?? 'UZS',
        reminderLeadHours: settings.data.reminderLeadHours ?? 24,
      });
    }
  }, [settings.data]);

  if (tenant.isLoading) {
    return (
      <SettingsShell active="tenant">
        <Loader />
      </SettingsShell>
    );
  }

  const data = tenant.data;

  // Egasiga o'tkazish uchun nomzodlar (unique userId, joriy egadan tashqari).
  const ownerCandidates = [
    ...new Map(
      (users.data ?? []).filter((a) => a.userId !== data?.ownerUserId).map((a) => [a.userId, a]),
    ).values(),
  ].map((a) => ({ value: a.userId, label: `${a.userFullName ?? a.userPhone} (${a.userPhone})` }));

  const doTransfer = (v: TransferFormValues) => {
    transfer.mutate(v, {
      onSuccess: () => {
        closeConfirm();
        closeTransfer();
        transferForm.reset();
      },
      onError: (err) => {
        closeConfirm();
        notifications.show({
          title: t('common.error'),
          message: err instanceof ApiError ? err.message : t('settings.transfer_failed'),
          color: 'red',
        });
      },
    });
  };

  return (
    <SettingsShell active="tenant">
      <Stack gap="lg">
        {!hasPermission('tenant.edit') && (
          <Alert color="yellow" variant="light">
            {t('tenant_settings.readonly_notice')}
          </Alert>
        )}

        <Card withBorder padding="lg" radius="md">
          <Stack gap="md">
            <Group justify="space-between">
              <Stack gap={2}>
                <Text size="sm" c="dimmed">
                  {t('tenant_settings.slug')}
                </Text>
                <Text fw={600}>{data?.slug ?? '—'}</Text>
              </Stack>
              <Badge color={data?.subscriptionStatus === 'active' ? 'teal' : 'yellow'}>
                {data?.subscriptionStatus}
              </Badge>
            </Group>

            <form onSubmit={form.onSubmit((values) => update.mutate(values))}>
              <Stack gap="md">
                <TextInput
                  label={t('tenant_settings.name')}
                  required
                  disabled={!hasPermission('tenant.edit')}
                  {...form.getInputProps('name')}
                />
                <Select
                  label={t('tenant_settings.default_language')}
                  data={[
                    { value: 'uz', label: "O'zbek" },
                    { value: 'ru', label: 'Русский' },
                  ]}
                  disabled={!hasPermission('tenant.edit')}
                  {...form.getInputProps('defaultLanguage')}
                />
                {hasPermission('tenant.edit') && (
                  <Group justify="flex-end">
                    <Button type="submit" loading={update.isPending}>
                      {t('common.save')}
                    </Button>
                  </Group>
                )}
              </Stack>
            </form>
          </Stack>
        </Card>

        <Card withBorder padding="lg" radius="md">
          <Stack gap="md">
            <Text fw={600}>{t('tenant_settings.clinic_section')}</Text>
            {!canEditSettings && (
              <Alert color="yellow" variant="light">
                {t('tenant_settings.readonly_notice')}
              </Alert>
            )}
            {settings.isLoading ? (
              <Loader />
            ) : (
              <form onSubmit={settingsForm.onSubmit((values) => updateSettings.mutate(values))}>
                <Stack gap="md">
                  <Select
                    label={t('tenant_settings.vertical')}
                    data={[{ value: 'dental', label: t('tenant_settings.vertical_dental') }]}
                    disabled={!canEditSettings}
                    {...settingsForm.getInputProps('vertical')}
                  />
                  <TextInput
                    label={t('tenant_settings.currency')}
                    required
                    disabled={!canEditSettings}
                    {...settingsForm.getInputProps('currency')}
                  />
                  <NumberInput
                    label={t('tenant_settings.reminder_lead_hours')}
                    min={0}
                    max={168}
                    disabled={!canEditSettings}
                    {...settingsForm.getInputProps('reminderLeadHours')}
                  />
                  {canEditSettings && (
                    <Group justify="flex-end">
                      <Button type="submit" loading={updateSettings.isPending}>
                        {t('common.save')}
                      </Button>
                    </Group>
                  )}
                </Stack>
              </form>
            )}
          </Stack>
        </Card>

        {hasPermission('tenant.edit') && (
          <Card withBorder padding="lg" radius="md">
            <Stack gap="md">
              <Text fw={600}>{t('settings.transfer_ownership')}</Text>
              <Text size="sm" c="dimmed">
                {t('settings.transfer_hint')}
              </Text>
              <Group>
                <Button color="red" variant="light" onClick={openTransfer}>
                  {t('settings.transfer_ownership')}
                </Button>
              </Group>
            </Stack>
          </Card>
        )}
      </Stack>

      {/* Transfer form modal */}
      <Modal
        opened={transferOpened}
        onClose={closeTransfer}
        title={t('settings.transfer_ownership')}
      >
        <Stack gap="md">
          <Select
            label={t('settings.transfer_new_owner')}
            data={ownerCandidates}
            searchable
            required
            {...transferForm.getInputProps('newOwnerUserId')}
          />
          <PasswordInput
            label={t('settings.transfer_current_password')}
            required
            {...transferForm.getInputProps('currentPassword')}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={closeTransfer}>
              {t('common.cancel')}
            </Button>
            <Button
              color="red"
              onClick={() => {
                if (!transferForm.validate().hasErrors) openConfirm();
              }}
            >
              {t('settings.transfer_ownership')}
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Transfer confirm */}
      <ConfirmModal
        opened={confirmOpened}
        onClose={closeConfirm}
        onConfirm={() => doTransfer(transferForm.values)}
        message={t('settings.transfer_confirm')}
        loading={transfer.isPending}
      />
    </SettingsShell>
  );
}
