import { Mono, StateView } from '@dental/ui';
import {
  ActionIcon,
  Box,
  Button,
  Card,
  Group,
  Modal,
  NumberInput,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useDisclosure } from '@mantine/hooks';
import { IconPill, IconPlus, IconTrash } from '@tabler/icons-react';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/auth-store.ts';
import { useCreatePrescription, usePrescriptions } from '../../clinical.api';
import { toPrescriptionVM } from '../../clinical.mappers';
import { type PrescriptionFormValues, prescriptionFormSchema } from '../../clinical.schema';

type Props = { patientId: string };

export function PrescriptionsTab({ patientId }: Props) {
  const { t } = useTranslation();
  const { user, hasPermission } = useAuthStore();
  const [opened, { open, close }] = useDisclosure(false);
  const canManage = hasPermission('prescription.manage');
  const canView = hasPermission('prescription.view');

  const listQuery = usePrescriptions(patientId);
  const createMut = useCreatePrescription(patientId);

  const form = useForm<PrescriptionFormValues>({
    initialValues: { diagnosis: '', notes: '', items: [] },
    validate: zod4Resolver(prescriptionFormSchema),
  });

  if (!canView) return <Text c="dimmed">{t('patients.no_medical_permission')}</Text>;

  const submit = form.onSubmit((values) => {
    if (!user) return;
    createMut.mutate(
      {
        patientId,
        doctorId: user.id,
        items: values.items,
        diagnosis: values.diagnosis || undefined,
        notes: values.notes || undefined,
      },
      {
        onSuccess: () => {
          form.reset();
          close();
        },
      },
    );
  });

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Title order={4}>{t('prescription.title')}</Title>
        {canManage && (
          <Button leftSection={<IconPlus size={16} />} onClick={open}>
            {t('prescription.create')}
          </Button>
        )}
      </Group>

      {listQuery.isError ? (
        <StateView
          status="error"
          title={t('states.error_title')}
          retryLabel={t('states.retry')}
          onRetry={() => listQuery.refetch()}
        />
      ) : listQuery.isLoading ? (
        <StateView status="loading" skeleton="cards" />
      ) : (listQuery.data?.length ?? 0) === 0 ? (
        <StateView status="empty" title={t('prescription.empty')} />
      ) : (
        <Box
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 14,
          }}
        >
          {listQuery.data?.map(toPrescriptionVM).map((rx) => (
            <Box
              key={rx.id}
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 14,
                boxShadow: 'var(--shadow-sm)',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                overflow: 'hidden',
                padding: 16,
              }}
            >
              <Group justify="space-between" wrap="nowrap" align="flex-start">
                <Box
                  aria-hidden
                  style={{
                    alignItems: 'center',
                    background: 'var(--info-soft)',
                    borderRadius: 'var(--radius-pill)',
                    color: 'var(--info)',
                    display: 'flex',
                    flex: '0 0 auto',
                    height: 32,
                    justifyContent: 'center',
                    width: 32,
                  }}
                >
                  <IconPill size={18} />
                </Box>
                <Box style={{ fontSize: 11.5 }}>
                  <Mono>{rx.issuedDateText}</Mono>
                </Box>
              </Group>

              {rx.diagnosis && (
                <Text size="xs" style={{ color: 'var(--ink-3)' }}>
                  {t('prescription.diagnosis')}: {rx.diagnosis}
                </Text>
              )}

              <Box style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {rx.items.map((it, i) => (
                  <Box
                    // biome-ignore lint/suspicious/noArrayIndexKey: stable items from server-side row
                    key={`rx-${rx.id}-${i}`}
                    style={{ display: 'flex', flexDirection: 'column', gap: 3 }}
                  >
                    <Text fw={700} size="sm" style={{ color: 'var(--ink)' }}>
                      {it.medicationName}
                    </Text>
                    <Box
                      style={{
                        color: 'var(--ink-2)',
                        display: 'flex',
                        flexWrap: 'wrap',
                        fontSize: 12,
                        gap: '2px 12px',
                      }}
                    >
                      <span>
                        {t('prescription.dosage')}: <Mono>{it.dosage}</Mono>
                      </span>
                      <span>
                        {t('prescription.frequency')}: <Mono>{it.frequency}</Mono>
                      </span>
                      {it.durationDays != null && (
                        <span>
                          {t('prescription.duration_days')}:{' '}
                          <Mono>
                            {t('prescription.duration_days_suffix', { days: it.durationDays })}
                          </Mono>
                        </span>
                      )}
                    </Box>
                    {it.instructions && (
                      <Text size="xs" style={{ color: 'var(--ink-3)' }}>
                        {it.instructions}
                      </Text>
                    )}
                  </Box>
                ))}
              </Box>

              {rx.notes && (
                <Text
                  size="xs"
                  style={{
                    borderTop: '1px solid var(--border)',
                    color: 'var(--ink-3)',
                    fontSize: 11.5,
                    marginTop: 'auto',
                    paddingTop: 8,
                  }}
                >
                  {rx.notes}
                </Text>
              )}
            </Box>
          ))}
        </Box>
      )}

      <Modal opened={opened} onClose={close} title={t('prescription.create')} size="xl">
        <form onSubmit={submit}>
          <Stack gap="md">
            <TextInput label={t('prescription.diagnosis')} {...form.getInputProps('diagnosis')} />
            <Group justify="space-between">
              <Text fw={600}>{t('prescription.items')}</Text>
              <Button
                size="xs"
                variant="light"
                leftSection={<IconPlus size={14} />}
                onClick={() =>
                  form.insertListItem('items', { medicationName: '', dosage: '', frequency: '' })
                }
              >
                {t('prescription.add_item')}
              </Button>
            </Group>
            {form.values.items.map((_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: ephemeral draft list
              <Card withBorder key={`item-${i}`} padding="sm">
                <Stack gap="xs">
                  <Group justify="space-between">
                    <Text fw={600}>#{i + 1}</Text>
                    <ActionIcon
                      color="red"
                      variant="subtle"
                      onClick={() => form.removeListItem('items', i)}
                      aria-label={t('common.delete')}
                    >
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Group>
                  <TextInput
                    label={t('prescription.medication_name')}
                    {...form.getInputProps(`items.${i}.medicationName`)}
                  />
                  <Group grow>
                    <TextInput
                      label={t('prescription.dosage')}
                      {...form.getInputProps(`items.${i}.dosage`)}
                    />
                    <TextInput
                      label={t('prescription.frequency')}
                      placeholder={t('prescription.frequency_placeholder')}
                      {...form.getInputProps(`items.${i}.frequency`)}
                    />
                    <NumberInput
                      label={t('prescription.duration_days')}
                      min={1}
                      // To'liq controlled (alohida value+onChange) — `getInputProps` spread'i
                      // ishlatilmaydi, chunki u ham `value` keltiradi va bir xil prop ikki marta
                      // berilishi mo'rt. value hech qachon `undefined` bo'lmaydi (`''` yoki number):
                      // undefined↔number o'tishi NumberInput'da controlled→uncontrolled React
                      // warning beradi (CLI-156). Reset/saqlash yo'lida ham `''` ga tushadi.
                      value={form.values.items[i]?.durationDays ?? ''}
                      onChange={(v) =>
                        form.setFieldValue(
                          `items.${i}.durationDays`,
                          typeof v === 'number' ? v : undefined,
                        )
                      }
                      error={form.errors[`items.${i}.durationDays`]}
                    />
                  </Group>
                  <Textarea
                    label={t('prescription.instructions')}
                    rows={2}
                    {...form.getInputProps(`items.${i}.instructions`)}
                  />
                </Stack>
              </Card>
            ))}
            <Textarea label={t('prescription.notes')} rows={2} {...form.getInputProps('notes')} />
            <Group justify="flex-end">
              <Button variant="default" onClick={close}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" loading={createMut.isPending} disabled={!form.isValid()}>
                {t('prescription.save')}
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Stack>
  );
}
