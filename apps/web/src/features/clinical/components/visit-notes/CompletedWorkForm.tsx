import type { RecordCompletedWorkBodyItemsItem, ToothState } from '@dental/api-client';
import { Button } from '@dental/ui';
import { MultiSelect, Select } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRecordCompletedWork, useServicePrices } from '../../clinical.api';

/** FDI doimiy tishlar (11–18, 21–28, 31–38, 41–48) — backend `isValidFdi` bilan mos. */
const PERMANENT_TEETH = [1, 2, 3, 4].flatMap((q) =>
  Array.from({ length: 8 }, (_, i) => String(q * 10 + i + 1)),
);
/** FDI sut tishlari (51–55, 61–65, 71–75, 81–85). */
const PRIMARY_TEETH = [5, 6, 7, 8].flatMap((q) =>
  Array.from({ length: 5 }, (_, i) => String(q * 10 + i + 1)),
);

const RESULT_STATES: ToothState[] = [
  'filling',
  'crown',
  'root_canal',
  'implant',
  'missing',
  'temporary',
  'veneer',
  'healthy',
];

type Props = {
  patientId: string;
  /** Saqlangan (imzolanmagan, bosqichsiz) vizit yozuvi; `null` — avval saqlash kerak. */
  visitNoteId: string | null;
  serviceOptions: { value: string; label: string }[];
  branchId: string | null;
  disabled?: boolean;
  /** Yangi bosqich vizitga bog'langach — sahifa holati (`stageId`) shu bilan moslanadi. */
  onRecorded: (stageId: string) => void;
};

/**
 * FT-01.2 (CF-12) — vizit sahifasidagi «Bajarilgan ishni yozish»: tish(lar) + xizmat →
 * darhol bajarilgan bosqich (joriy reja yoki avto «Bajarilgan ishlar» rejasi), vizitga
 * bog'lanadi. Vizit bitta bosqichga bog'lanadi — bitta xizmat.
 */
export function CompletedWorkForm({
  patientId,
  visitNoteId,
  serviceOptions,
  branchId,
  disabled,
  onRecorded,
}: Props) {
  const { t } = useTranslation();
  const record = useRecordCompletedWork(patientId);
  const [open, setOpen] = useState(false);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [teeth, setTeeth] = useState<string[]>([]);
  const [state, setState] = useState<ToothState | null>(null);
  const prices = useServicePrices(serviceId ? [serviceId] : [], branchId);

  const toothData = [
    { group: t('visitNote.completedWork.permanent'), items: PERMANENT_TEETH },
    { group: t('visitNote.completedWork.primary'), items: PRIMARY_TEETH },
  ];

  if (!visitNoteId) {
    return (
      <div style={{ display: 'grid', gap: 6 }}>
        <Button variant="default" disabled>
          {t('visitNote.completedWork.title')}
        </Button>
        <span style={{ fontSize: 13, color: 'var(--text-2)' }}>
          {t('visitNote.completedWork.saveFirst')}
        </span>
      </div>
    );
  }

  if (!open) {
    return (
      <Button variant="default" disabled={disabled} onClick={() => setOpen(true)}>
        {t('visitNote.completedWork.title')}
      </Button>
    );
  }

  const submit = async () => {
    if (!serviceId) return;
    const label = serviceOptions.find((o) => o.value === serviceId)?.label ?? serviceId;
    const toothNumbers = teeth.map(Number);
    const item: RecordCompletedWorkBodyItemsItem = {
      serviceId,
      serviceName: label,
      // Narx serverda filial narxidan (CLI-443); topilmasa — ko'rsatilgan narx yoki 0.
      cost: prices.get(serviceId) ?? 0,
      ...(toothNumbers.length > 0 ? { toothNumbers } : {}),
      ...(state && toothNumbers.length > 0 ? { resultingToothState: state } : {}),
    };
    const res = await record.mutateAsync({ visitNoteId, items: [item] });
    const stage = res.stages[0];
    notifications.show({ message: t('visitNote.completedWork.done'), color: 'teal' });
    setOpen(false);
    setServiceId(null);
    setTeeth([]);
    setState(null);
    if (stage) onRecorded(stage.id);
  };

  return (
    <fieldset
      aria-label={t('visitNote.completedWork.title')}
      style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 8 }}
    >
      <span style={{ fontSize: 13, color: 'var(--text-2)' }}>
        {t('visitNote.completedWork.hint')}
      </span>
      <Select
        label={t('visitNote.completedWork.service')}
        placeholder={t('visitNote.completedWork.servicePlaceholder')}
        data={serviceOptions}
        value={serviceId}
        onChange={setServiceId}
        searchable
        required
      />
      <MultiSelect
        label={t('visitNote.completedWork.teeth')}
        placeholder={t('visitNote.completedWork.teethPlaceholder')}
        data={toothData}
        value={teeth}
        onChange={setTeeth}
        searchable
      />
      <Select
        label={t('visitNote.completedWork.resultingState')}
        data={RESULT_STATES.map((s) => ({ value: s, label: t(`tooth_chart.states.${s}`) }))}
        value={state}
        onChange={(v) => setState(v as ToothState | null)}
        disabled={teeth.length === 0}
        clearable
      />
      <div style={{ display: 'flex', gap: 8 }}>
        <Button
          variant="primary"
          disabled={!serviceId || record.isPending}
          onClick={() => void submit().catch(() => {})}
        >
          {t('visitNote.completedWork.submit')}
        </Button>
        <Button variant="default" onClick={() => setOpen(false)}>
          {t('common.cancel')}
        </Button>
      </div>
    </fieldset>
  );
}
