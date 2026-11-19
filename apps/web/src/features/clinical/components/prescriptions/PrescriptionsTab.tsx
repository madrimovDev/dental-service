import { CriticalActionDialog, Mono, StateView } from '@dental/ui';
import {
  ActionIcon,
  Box,
  Button,
  Card,
  Group,
  Modal,
  NumberInput,
  Select,
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
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMedicalRecord } from '@/features/patients/patients.api';
import { useAuthStore } from '@/stores/auth-store.ts';
import {
  firstUnresolvedDrugConflict,
  isAllergyUnknown,
  overridesForDrugs,
  serverAllergyConflict,
  unknownAllergyOverrides,
} from '../../allergy-guard';
import { useCreatePrescription, usePrescriptions } from '../../clinical.api';
import { toPrescriptionVM } from '../../clinical.mappers';
import { type PrescriptionFormValues, prescriptionFormSchema } from '../../clinical.schema';
import type { AllergyOverride } from '../../clinical.types';
import { useClinicalAuthor } from '../../clinical-author';

const CONFLICT_REASONS = [
  'benefit_outweighs_risk',
  'patient_informed',
  'allergy_not_confirmed',
  'no_alternative',
] as const;
const UNKNOWN_REASONS = [
  'allergy_checked_verbally',
  'benefit_outweighs_risk',
  'patient_informed',
] as const;

/** FX-22: kritik oyna holati — qaysi sabab bilan, qaysi forma qiymatlari qayta yuboriladi. */
type Prompt =
  | { kind: 'unknown'; values: PrescriptionFormValues; overrides: AllergyOverride[] }
  | {
      kind: 'conflict';
      values: PrescriptionFormValues;
      overrides: AllergyOverride[];
      conflict: { drug: string; group: string; allergen: string };
    };

type Props = { patientId: string };

export function PrescriptionsTab({ patientId }: Props) {
  const { t } = useTranslation();
  const { user, hasPermission } = useAuthStore();
  const [opened, { open, close }] = useDisclosure(false);
  const canManage = hasPermission('prescription.manage');
  const canView = hasPermission('prescription.view');
  // FX-155 review: muallif shifokor bo'lishi shart — Branch Manager/Tenant Admin o'z nomidan
  // yoza olmaydi (server 400). `on_behalf` bo'lsa shifokor tanlanadi; aks holda tugma yo'q.
  const author = useClinicalAuthor('prescription.on_behalf');
  const canCreate = canManage && author.canAuthor;
  const [pickedDoctorId, setPickedDoctorId] = useState<string | null>(null);
  const doctorId = pickedDoctorId ?? author.defaultDoctorId;

  const listQuery = usePrescriptions(patientId);
  const createMut = useCreatePrescription(patientId);
  const medicalQuery = useMedicalRecord(patientId);
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  // Noma'lum allergiyada tasdiqlangan sabab (forma yopilguncha/muvaffaqiyatgacha eslab qolinadi).
  const [unknownAck, setUnknownAck] = useState<string | null>(null);

  const form = useForm<PrescriptionFormValues>({
    initialValues: { diagnosis: '', notes: '', items: [] },
    validate: zod4Resolver(prescriptionFormSchema),
  });

  if (!canView) return <Text c="dimmed">{t('patients.no_medical_permission')}</Text>;

  const send = (values: PrescriptionFormValues, overrides: AllergyOverride[]) => {
    if (!user || !doctorId) return;
    const drugs = values.items.map((i) => i.medicationName);
    createMut.mutate(
      {
        patientId,
        doctorId,
        items: values.items,
        diagnosis: values.diagnosis || undefined,
        notes: values.notes || undefined,
        allergyOverrides: overridesForDrugs(drugs, overrides),
      },
      {
        onSuccess: () => {
          form.reset();
          close();
          setPrompt(null);
          setUnknownAck(null);
        },
        onError: (e) => {
          // FX-22: server o'zi ham tekshiradi — bizda ma'lumot yo'q/eskirgan bo'lsa ham oyna chiqadi.
          const conflict = serverAllergyConflict(e);
          if (conflict) setPrompt({ kind: 'conflict', values, overrides, conflict });
        },
      },
    );
  };

  /** Mijoz tomonidagi qo'riqchi: avval to'qnashuv, so'ng noma'lum allergiya, so'ng yuborish. */
  const attempt = (
    values: PrescriptionFormValues,
    overrides: AllergyOverride[],
    unknownReason: string | null = unknownAck,
  ) => {
    const drugs = values.items.map((i) => i.medicationName);
    if (isAllergyUnknown(medicalQuery)) {
      if (!unknownReason) {
        setPrompt({ kind: 'unknown', values, overrides });
        return;
      }
    } else {
      const hit = firstUnresolvedDrugConflict(drugs, medicalQuery.data?.allergies, overrides);
      if (hit) {
        setPrompt({ kind: 'conflict', values, overrides, conflict: hit.conflict });
        return;
      }
    }
    send(
      values,
      unknownReason ? [...overrides, ...unknownAllergyOverrides(drugs, unknownReason)] : overrides,
    );
  };

  const submit = form.onSubmit((values) => attempt(values, []));

  const confirmPrompt = (reason: string | null) => {
    if (!prompt || !reason) return;
    setPrompt(null);
    if (prompt.kind === 'unknown') {
      setUnknownAck(reason);
      attempt(prompt.values, prompt.overrides, reason);
    } else {
      const { drug, group, allergen } = prompt.conflict;
      attempt(prompt.values, [...prompt.overrides, { drug, group, allergen, reason }]);
    }
  };

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Title order={4}>{t('prescription.title')}</Title>
        {canCreate && (
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
            {author.showPicker && (
              <Select
                label={t('clinicalAuthor.doctor')}
                placeholder={t('clinicalAuthor.doctorPlaceholder')}
                data={author.options}
                value={doctorId}
                onChange={setPickedDoctorId}
                allowDeselect={false}
                required
              />
            )}
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
              <Button
                type="submit"
                loading={createMut.isPending}
                disabled={!form.isValid() || !doctorId}
              >
                {t('prescription.save')}
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      <CriticalActionDialog
        opened={prompt !== null}
        title={t(
          prompt?.kind === 'unknown' ? 'visitNote.allergyUnknownTitle' : 'visitNote.allergyTitle',
        )}
        reasons={(prompt?.kind === 'unknown' ? UNKNOWN_REASONS : CONFLICT_REASONS).map((r) => ({
          value: r,
          label: t(`visitNote.reason.${r}`),
        }))}
        reasonsLabel={t('visitNote.reasonsLabel')}
        safeLabel={t(
          prompt?.kind === 'unknown' ? 'visitNote.allergyUnknownSafe' : 'visitNote.allergySafe',
        )}
        dangerLabel={t('visitNote.allergyDanger')}
        onSafe={() => setPrompt(null)}
        onConfirm={confirmPrompt}
      >
        {prompt?.kind === 'conflict'
          ? t('visitNote.allergyBody', {
              allergen: prompt.conflict.allergen,
              drug: prompt.conflict.drug,
            })
          : prompt?.kind === 'unknown'
            ? t('visitNote.allergyUnknownBody')
            : ''}
      </CriticalActionDialog>
    </Stack>
  );
}
