import type { LabOrderStatus, LabOrderType } from '@dental/api-client';
import { Mono } from '@dental/ui';
import {
  Button,
  Checkbox,
  Chip,
  FileButton,
  Group,
  Modal,
  NumberInput,
  Select,
  Stack,
  Textarea,
  TextInput,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { IconX } from '@tabler/icons-react';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePatient } from '@/features/patients/patients.api';
import { useAuthStore } from '@/stores/auth-store.ts';
import {
  useCreateLabOrder,
  usePatientAppointments,
  useUpdateLabOrderStatus,
} from '../../clinical.api';
import { parseToothNumbers } from '../../clinical.mappers';
import { LabOrderChain } from './LabOrderChain';
import classes from './LabOrderForm.module.css';
import { useUploadLabOrderFile } from './lab-order.api';
import {
  compareDueWithAppointment,
  formatDueDate,
  LAB_MATERIALS,
  LAB_ORDER_TYPES,
  LAB_REMAKE_REASONS,
  LAB_SHADES,
  type LabOrderWire,
  nextAppointmentStart,
} from './lab-order.helpers';
import { type LabOrderFormValues, labOrderFormSchema } from './lab-order.schema';

const SHADE_COLORS: Record<string, string> = {
  A1: '#efe3cf',
  A2: '#e8d8bd',
  A3: '#dcc59c',
  'A3.5': '#d2b283',
  B1: '#f0e6d2',
  B2: '#e6d7b8',
  C1: '#ddd0b6',
  D2: '#d8cab0',
};

const initialValues: LabOrderFormValues = {
  labName: '',
  orderType: 'crown',
  toothNumbersText: '',
  material: '',
  description: '',
  shade: '',
  dueDate: '',
  cost: undefined,
  notes: '',
  isRemake: false,
  remakeOfId: null,
  remakeReason: null,
};

const formatBytes = (n: number) =>
  n >= 1024 * 1024
    ? `${(n / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(n / 1024))} KB`;

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => `${p[0]?.toUpperCase()}.`)
    .join(' ');

type Props = {
  opened: boolean;
  onClose: () => void;
  patientId: string;
  /** Shu bemorning mavjud buyurtmalari — remake uchun "asl buyurtma" tanlovi. */
  existingOrders: LabOrderWire[];
};

export function LabOrderFormModal({ opened, onClose, patientId, existingOrders }: Props) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const [files, setFiles] = useState<File[]>([]);

  const form = useForm<LabOrderFormValues>({
    initialValues,
    validate: zod4Resolver(labOrderFormSchema),
  });

  const createMut = useCreateLabOrder(patientId);
  const statusMut = useUpdateLabOrderStatus(patientId);
  const uploadMut = useUploadLabOrderFile();
  const patientQuery = usePatient(patientId);
  const apptQuery = usePatientAppointments(patientId);

  const v = form.values;
  const patient = patientQuery.data;
  const nextAppt = useMemo(() => nextAppointmentStart(apptQuery.data), [apptQuery.data]);
  const dueCheck = compareDueWithAppointment(v.dueDate, nextAppt);

  const teeth = parseToothNumbers(v.toothNumbersText);
  const typeLabel = t(`lab_order.type_${v.orderType}`);
  const autoDescription = teeth.length > 0 ? `${typeLabel} ${teeth.join(', ')}` : typeLabel;
  const materialLabel = v.material ? t(`labOrder.material_${v.material}`) : null;
  const summary =
    [
      v.orderType ? `${typeLabel}${teeth.length ? ` ${teeth.join('–')}` : ''}` : null,
      materialLabel,
      v.shade || null,
      formatDueDate(v.dueDate),
      v.labName || null,
    ]
      .filter(Boolean)
      .join(' · ') || t('labOrder.summary_empty');

  const originals = existingOrders.filter((o) => o.status !== 'cancelled');
  const err = (field: keyof LabOrderFormValues) => {
    const m = form.errors[field];
    return typeof m === 'string' && m ? t(m) : undefined;
  };

  const reset = () => {
    form.reset();
    setFiles([]);
  };
  const close = () => {
    reset();
    onClose();
  };

  const submit = (send: boolean) =>
    form.onSubmit(async (values) => {
      if (!user) return;
      const nums = parseToothNumbers(values.toothNumbersText);
      try {
        const order = await createMut.mutateAsync({
          patientId,
          doctorId: user.id,
          labName: values.labName.trim(),
          orderType: values.orderType as LabOrderType,
          items: [
            {
              description: values.description.trim() || autoDescription,
              toothNumbers: nums.length ? nums : undefined,
              material: values.material ? t(`labOrder.material_${values.material}`) : undefined,
              shade: values.shade,
            },
          ],
          shade: values.shade,
          dueDate: values.dueDate,
          ...(values.isRemake && values.remakeOfId && values.remakeReason
            ? { remakeOfId: values.remakeOfId, remakeReason: values.remakeReason }
            : {}),
          cost: values.cost,
          notes: values.notes.trim() || undefined,
        });

        let failed = 0;
        for (const file of files) {
          try {
            await uploadMut.mutateAsync({ labOrderId: order.id, file });
          } catch {
            failed += 1;
          }
        }
        if (send) {
          await statusMut.mutateAsync({ id: order.id, status: 'sent' as LabOrderStatus });
        }
        if (failed > 0) {
          notifications.show({ color: 'yellow', message: t('labOrder.files_failed') });
        }
        close();
      } catch {
        // Global MutationCache.onError xato toast'ini ko'rsatadi; forma ochiq qoladi.
      }
    });

  const busy = createMut.isPending || statusMut.isPending || uploadMut.isPending;

  return (
    <Modal
      opened={opened}
      onClose={close}
      size="min(1100px, 96vw)"
      title={patient ? t('labOrder.title_for', { name: patient.fullName }) : t('labOrder.title')}
    >
      <form onSubmit={submit(true)}>
        <div className={classes.layout}>
          <Stack gap="md">
            <section className={classes.card}>
              <h3 className={classes.cardTitle}>{t('labOrder.lab_section')}</h3>
              <TextInput
                label={t('lab_order.lab_name')}
                description={t('labOrder.lab_name_hint')}
                required
                {...form.getInputProps('labName')}
                error={err('labName')}
              />
            </section>

            <section className={classes.card}>
              <h3 className={classes.cardTitle}>{t('labOrder.job_section')}</h3>
              <Stack gap="md">
                <div>
                  <div className={classes.label}>{t('labOrder.type')}</div>
                  <Chip.Group
                    multiple={false}
                    value={v.orderType}
                    onChange={(val) =>
                      form.setFieldValue('orderType', val as LabOrderFormValues['orderType'])
                    }
                  >
                    <div className={classes.chips}>
                      {LAB_ORDER_TYPES.map((tp) => (
                        <Chip key={tp} value={tp} variant="outline">
                          {t(`lab_order.type_${tp}`)}
                        </Chip>
                      ))}
                    </div>
                  </Chip.Group>
                </div>

                <Group grow align="flex-start">
                  <TextInput
                    label={t('labOrder.teeth')}
                    placeholder="34, 35, 36"
                    description={t('labOrder.teeth_hint')}
                    {...form.getInputProps('toothNumbersText')}
                  />
                  <div>
                    <div className={classes.label}>{t('labOrder.material')}</div>
                    <Chip.Group
                      multiple={false}
                      value={v.material}
                      onChange={(val) => form.setFieldValue('material', val)}
                    >
                      <div className={classes.chips}>
                        {LAB_MATERIALS.map((m) => (
                          <Chip key={m} value={m} variant="outline">
                            {t(`labOrder.material_${m}`)}
                          </Chip>
                        ))}
                      </div>
                    </Chip.Group>
                  </div>
                </Group>

                <div>
                  <div className={classes.label}>
                    {t('labOrder.shade')} ·{' '}
                    <span className={classes.required}>{t('labOrder.required')}</span>
                  </div>
                  <Chip.Group
                    multiple={false}
                    value={v.shade}
                    onChange={(val) => form.setFieldValue('shade', val)}
                  >
                    <div className={classes.chips} data-testid="shade-chips">
                      {LAB_SHADES.map((s) => (
                        <Chip key={s} value={s} variant="outline">
                          <span
                            className={classes.swatch}
                            style={{ background: SHADE_COLORS[s] }}
                            aria-hidden="true"
                          />
                          {s}
                        </Chip>
                      ))}
                    </div>
                  </Chip.Group>
                  {err('shade') ? (
                    <div className={classes.err} role="alert">
                      {err('shade')}
                    </div>
                  ) : (
                    <div className={classes.hint}>{t('labOrder.shade_hint')}</div>
                  )}
                </div>

                <Group grow align="flex-start">
                  <div>
                    <TextInput
                      label={
                        <>
                          {t('labOrder.due_date')} ·{' '}
                          <span className={classes.required}>{t('labOrder.required')}</span>
                        </>
                      }
                      type="date"
                      {...form.getInputProps('dueDate')}
                      error={err('dueDate')}
                    />
                    {v.dueDate && dueCheck.kind === 'ok' && (
                      <div className={classes.okNote}>
                        {t('labOrder.due_ok', {
                          date: dueCheck.apptDate,
                          time: dueCheck.apptTime,
                          days: dueCheck.days,
                        })}
                      </div>
                    )}
                    {v.dueDate && dueCheck.kind === 'late' && (
                      <div className={classes.warn} role="alert">
                        {t('labOrder.due_late', {
                          date: dueCheck.apptDate,
                          time: dueCheck.apptTime,
                          days: dueCheck.days,
                        })}
                      </div>
                    )}
                    {!v.dueDate && !nextAppt && !apptQuery.isLoading && (
                      <div className={classes.hint}>{t('labOrder.due_none')}</div>
                    )}
                  </div>
                  <Textarea
                    label={t('labOrder.tech_notes')}
                    rows={3}
                    {...form.getInputProps('notes')}
                  />
                </Group>

                <Group grow align="flex-start">
                  <TextInput
                    label={t('labOrder.description')}
                    description={t('labOrder.description_hint')}
                    {...form.getInputProps('description')}
                  />
                  <NumberInput
                    label={t('lab_order.cost')}
                    min={0}
                    value={v.cost ?? ''}
                    onChange={(val) =>
                      form.setFieldValue('cost', typeof val === 'number' ? val : undefined)
                    }
                  />
                </Group>
              </Stack>
            </section>

            <section className={classes.card}>
              <h3 className={classes.cardTitle}>{t('labOrder.files_section')}</h3>
              <Stack gap="xs">
                {files.length === 0 && (
                  <div className={classes.hint}>{t('labOrder.files_empty')}</div>
                )}
                {files.map((f, i) => (
                  <div key={`${f.name}-${f.size}-${f.lastModified}`} className={classes.fileRow}>
                    <span>
                      {f.name} · <Mono>{formatBytes(f.size)}</Mono>
                    </span>
                    <Button
                      variant="subtle"
                      size="compact-xs"
                      aria-label={`${t('labOrder.file_remove')}: ${f.name}`}
                      onClick={() => setFiles((cur) => cur.filter((_, j) => j !== i))}
                    >
                      <IconX size={14} />
                    </Button>
                  </div>
                ))}
                <Group>
                  <FileButton
                    multiple
                    accept="image/jpeg,image/png,image/webp,application/pdf,.stl,.ply,.obj"
                    onChange={(picked) => setFiles((cur) => [...cur, ...picked])}
                  >
                    {(props) => (
                      <Button variant="default" {...props}>
                        {t('labOrder.add_file')}
                      </Button>
                    )}
                  </FileButton>
                  <span className={classes.hint}>{t('labOrder.files_hint')}</span>
                </Group>
              </Stack>
            </section>

            <section className={classes.card}>
              <Checkbox
                label={t('labOrder.remake_label')}
                description={t('labOrder.remake_hint')}
                checked={v.isRemake}
                onChange={(e) => {
                  form.setFieldValue('isRemake', e.currentTarget.checked);
                  if (!e.currentTarget.checked) {
                    form.setFieldValue('remakeOfId', null);
                    form.setFieldValue('remakeReason', null);
                  }
                }}
              />
              {v.isRemake && (
                <Stack gap="sm" mt="md">
                  <Select
                    label={t('labOrder.remake_original')}
                    placeholder={originals.length === 0 ? t('labOrder.no_original') : undefined}
                    data={originals.map((o) => ({
                      value: o.id,
                      label: `${o.orderNumber ? `#${o.orderNumber} ` : ''}${o.labName} · ${t(`lab_order.type_${o.orderType}`)}`,
                    }))}
                    value={v.remakeOfId}
                    onChange={(val) => form.setFieldValue('remakeOfId', val)}
                    error={err('remakeOfId')}
                  />
                  <div>
                    <div className={classes.label}>{t('labOrder.remake_reason')}</div>
                    <Chip.Group
                      multiple={false}
                      value={v.remakeReason ?? ''}
                      onChange={(val) =>
                        form.setFieldValue(
                          'remakeReason',
                          (val || null) as LabOrderFormValues['remakeReason'],
                        )
                      }
                    >
                      <div className={classes.chips}>
                        {LAB_REMAKE_REASONS.map((r) => (
                          <Chip key={r} value={r} variant="outline">
                            {t(`labOrder.reason_${r}`)}
                          </Chip>
                        ))}
                      </div>
                    </Chip.Group>
                    {err('remakeReason') && (
                      <div className={classes.err} role="alert">
                        {err('remakeReason')}
                      </div>
                    )}
                  </div>
                </Stack>
              )}
            </section>
          </Stack>

          <Stack gap="md">
            <section className={classes.card}>
              <h3 className={classes.cardTitle}>{t('labOrder.sees_title')}</h3>
              <div className={classes.seesGrid} data-testid="lab-sees">
                <span className={classes.seesKey}>{t('labOrder.sees_patient')}</span>
                <span className={classes.seesVal}>
                  {patient
                    ? [
                        initials(patient.fullName),
                        patient.genderLabel,
                        patient.age != null ? `${patient.age}` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')
                    : '—'}
                </span>
                <span className={classes.seesKey}>{t('labOrder.sees_job')}</span>
                <span className={classes.seesVal}>{v.orderType ? autoDescription : '—'}</span>
                <span className={classes.seesKey}>{t('labOrder.shade')}</span>
                <span className={classes.seesVal}>{v.shade || '—'}</span>
                <span className={classes.seesKey}>{t('labOrder.due_date')}</span>
                <span className={classes.seesVal}>{formatDueDate(v.dueDate) ?? '—'}</span>
                <span className={classes.seesKey}>{t('labOrder.sees_doctor')}</span>
                <span className={classes.seesVal}>{user?.fullName ?? '—'}</span>
                <span className={classes.seesKey}>{t('labOrder.sees_files')}</span>
                <span className={classes.seesVal}>{files.length}</span>
                <span className={classes.seesKey}>{t('labOrder.sees_contact')}</span>
                <span className={classes.seesHidden}>{t('labOrder.sees_hidden')}</span>
              </div>
              <div className={classes.hint}>{t('labOrder.sees_note')}</div>
            </section>

            <section className={classes.card}>
              <h3 className={classes.cardTitle}>{t('labOrder.chain_title')}</h3>
              <LabOrderChain />
            </section>
          </Stack>
        </div>

        <div className={classes.footer}>
          <span className={classes.summary}>{summary}</span>
          <Group>
            <Button variant="default" onClick={close}>
              {t('common.cancel')}
            </Button>
            <Button variant="default" loading={busy} onClick={() => submit(false)()}>
              {t('labOrder.save_draft')}
            </Button>
            <Button type="submit" loading={busy}>
              {t('labOrder.send')}
            </Button>
          </Group>
        </div>
      </form>
    </Modal>
  );
}
