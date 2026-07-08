import { ApiError } from '@dental/api-client';
import { StatusPill } from '@dental/ui';
import {
  Alert,
  Button,
  Group,
  Loader,
  Modal,
  NumberInput,
  PasswordInput,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
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

const CARD_STYLE: React.CSSProperties = {
  maxWidth: 620,
  borderRadius: 'var(--radius-card)',
  padding: 22,
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  boxShadow: 'var(--shadow-sm)',
};

const INPUT_STYLES = {
  input: {
    height: 42,
    borderRadius: 10,
    backgroundColor: 'var(--surface-2)',
  },
} as const;

export function TenantSettingsScreen() {
  const { t } = useTranslation();
  const { hasPermission } = useAuthStore();
  const tenant = useTenant();
  const update = useUpdateTenant();
  const settings = useTenantSettings();
  const updateSettings = useUpdateTenantSettings();
  const transfer = useTransferOwnership();
  const users = useUsers();
  const canEditTenant = hasPermission('tenant.edit');
  const canEditSettings = hasPermission('tenant_settings.edit');
  const [transferOpened, { open: openTransfer, close: closeTransfer }] = useDisclosure(false);
  const [confirmOpened, { open: openConfirm, close: closeConfirm }] = useDisclosure(false);

  const form = useForm<TenantFormValues>({
    initialValues: { name: '', defaultLanguage: 'uz' },
    validate: zod4Resolver(tenantSchema),
  });

  const settingsForm = useForm<TenantSettingsFormValues>({
    initialValues: {
      vertical: 'dental',
      currency: 'UZS',
      reminderLeadHours: 24,
      maxDiscountPercent: 100,
    },
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
        vertical: (settings.data.vertical as 'dental' | 'general') ?? 'dental',
        currency: settings.data.currency ?? 'UZS',
        reminderLeadHours: settings.data.reminderLeadHours ?? 24,
        maxDiscountPercent: settings.data.maxDiscountPercent ?? 100,
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

  // Bitta «Saqlash» — ikkala forma (tenant + sozlamalar) o'z ruxsati bilan saqlanadi.
  // Permission gating O'ZGARMAYDI: tenant.edit → update, tenant_settings.edit → updateSettings.
  const handleSave = () => {
    if (canEditTenant) form.onSubmit((values) => update.mutate(values))();
    if (canEditSettings) settingsForm.onSubmit((values) => updateSettings.mutate(values))();
  };

  const vertical = settingsForm.values.vertical;
  const isSaving = update.isPending || updateSettings.isPending;
  const subscriptionActive = data?.subscriptionStatus === 'active';

  return (
    <SettingsShell active="tenant">
      <Stack gap="lg">
        {(!canEditTenant || !canEditSettings) && (
          <Alert color="yellow" variant="light" style={{ maxWidth: 620 }}>
            {t('tenant_settings.readonly_notice')}
          </Alert>
        )}

        <div style={CARD_STYLE}>
          <Stack gap={18}>
            <Title order={4} fw={700}>
              {t('tenant_settings.clinic_section')}
            </Title>

            {settings.isLoading ? (
              <Loader />
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 14,
                }}
              >
                <TextInput
                  style={{ gridColumn: 'span 2' }}
                  label={t('tenant_settings.name')}
                  required
                  disabled={!canEditTenant}
                  styles={INPUT_STYLES}
                  {...form.getInputProps('name')}
                />

                <TextInput
                  label={t('tenant_settings.slug')}
                  value={data?.slug ?? '—'}
                  readOnly
                  styles={{
                    input: {
                      ...INPUT_STYLES.input,
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--ink-2)',
                    },
                  }}
                />

                <Select
                  label={t('tenant_settings.default_language')}
                  data={[
                    { value: 'uz', label: "O'zbek" },
                    { value: 'ru', label: 'Русский' },
                  ]}
                  disabled={!canEditTenant}
                  styles={INPUT_STYLES}
                  {...form.getInputProps('defaultLanguage')}
                />

                {/* Vertical — segmented ikki-button toggle (Select o'rniga). */}
                <div style={{ gridColumn: 'span 2' }}>
                  <Text component="label" fz={14} fw={500} display="block" mb={6}>
                    {t('tenant_settings.vertical')}
                  </Text>
                  <Group gap="xs" grow>
                    {(['dental', 'general'] as const).map((value) => {
                      const isActive = vertical === value;
                      return (
                        <button
                          key={value}
                          type="button"
                          aria-pressed={isActive}
                          disabled={!canEditSettings}
                          onClick={() => settingsForm.setFieldValue('vertical', value)}
                          style={{
                            height: 42,
                            borderRadius: 10,
                            cursor: canEditSettings ? 'pointer' : 'not-allowed',
                            fontWeight: 600,
                            fontSize: 13.5,
                            border: isActive
                              ? '1.5px solid var(--primary)'
                              : '1.5px solid var(--border)',
                            background: isActive ? 'var(--primary-soft)' : 'var(--surface)',
                            color: isActive ? 'var(--primary)' : 'var(--ink-2)',
                          }}
                        >
                          {value === 'dental'
                            ? t('tenant_settings.vertical_dental')
                            : t('tenant_settings.vertical_general')}
                        </button>
                      );
                    })}
                  </Group>
                  <Text fz={12} c="dimmed" mt={6}>
                    {t('tenant_settings.vertical_hint')}
                  </Text>
                </div>

                <TextInput
                  label={t('tenant_settings.currency')}
                  required
                  disabled={!canEditSettings}
                  styles={INPUT_STYLES}
                  {...settingsForm.getInputProps('currency')}
                />

                <NumberInput
                  label={t('tenant_settings.reminder_lead_hours')}
                  min={0}
                  max={168}
                  disabled={!canEditSettings}
                  styles={INPUT_STYLES}
                  {...settingsForm.getInputProps('reminderLeadHours')}
                />

                <NumberInput
                  style={{ gridColumn: 'span 2' }}
                  label={t('tenant_settings.max_discount_percent')}
                  description={t('tenant_settings.max_discount_percent_hint')}
                  min={0}
                  max={100}
                  suffix="%"
                  clampBehavior="strict"
                  disabled={!canEditSettings}
                  styles={INPUT_STYLES}
                  {...settingsForm.getInputProps('maxDiscountPercent')}
                />
              </div>
            )}

            <Group
              justify="space-between"
              align="center"
              style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}
            >
              <StatusPill status={subscriptionActive ? 'success' : 'warning'}>
                {data?.subscriptionStatus ?? '—'}
              </StatusPill>
              {(canEditTenant || canEditSettings) && (
                <Button onClick={handleSave} loading={isSaving}>
                  {t('common.save')}
                </Button>
              )}
            </Group>
          </Stack>
        </div>

        {canEditTenant && (
          <div style={CARD_STYLE}>
            <Stack gap="md">
              <Title order={4} fw={700}>
                {t('settings.transfer_ownership')}
              </Title>
              <Text size="sm" c="dimmed">
                {t('settings.transfer_hint')}
              </Text>
              <Group>
                <Button color="red" variant="light" onClick={openTransfer}>
                  {t('settings.transfer_ownership')}
                </Button>
              </Group>
            </Stack>
          </div>
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
