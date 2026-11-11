import {
  ApiError,
  type Appointment,
  type Diagnosis,
  type ToothStateEntry,
} from '@dental/api-client';
import { Mono, StateView } from '@dental/ui';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useDiagnoses,
  useLatestToothChart,
  usePatientAppointments,
} from '@/features/clinical/clinical.api';
import { formatCurrency } from '@/lib/format';
import { usePatientBalance } from '../../patients.api';
import classes from './Overview.module.css';
import { Block, ForbiddenState, formatDate, isForbiddenError } from './shared';

export function BalanceBlock({ patientId }: { patientId: string }) {
  const { t } = useTranslation();
  const { data } = usePatientBalance(patientId);
  if (!data) return null;
  const debt = data.balance > 0;
  return (
    <Block titleId="pc-balance-h" title={t('patients.balance')}>
      <b className={`${classes.big} ${debt ? classes.bigDebt : ''}`}>
        {data.balance < 0 ? '−' : ''}
        {formatCurrency(Math.abs(data.balance), t)}
      </b>
      <span className={classes.muted}>
        {data.balance === 0
          ? t('patients.balance_paid')
          : debt
            ? t('patients.balance_debt')
            : t('patients.balance_credit')}
      </span>
    </Block>
  );
}

/** Eng yaqin bekor qilinmagan kelgusi yozilish. */
export function pickNextAppointment(items: Appointment[], now = Date.now()): Appointment | null {
  return (
    items
      .filter(
        (a) =>
          new Date(a.startTime).getTime() >= now &&
          a.status !== 'cancelled' &&
          a.status !== 'no_show' &&
          a.status !== 'completed',
      )
      .sort((a, b) => a.startTime.localeCompare(b.startTime))[0] ?? null
  );
}

export function NextVisitBlock({ patientId }: { patientId: string }) {
  const { t } = useTranslation();
  const query = usePatientAppointments(patientId);
  const title = t('patientCard.next_visit.title');
  if (isForbiddenError(query.error)) {
    return (
      <Block titleId="pc-next-h" title={title}>
        <ForbiddenState />
      </Block>
    );
  }
  if (query.isLoading) return null;
  const next = pickNextAppointment(query.data ?? []);
  return (
    <Block titleId="pc-next-h" title={title}>
      {next ? (
        <b style={{ fontSize: 17 }}>
          <Mono>
            {formatDate(next.startTime)}{' '}
            {new Date(next.startTime).toLocaleTimeString('en-GB', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Mono>
        </b>
      ) : (
        <span className={classes.muted}>{t('patientCard.next_visit.none')}</span>
      )}
    </Block>
  );
}

/** Ochiq tashxis: tashxisga bog'langan yoki davolanmagan (kariyes/olinadi) tish holatlari, `whole`/yuzadan qat'i nazar tish bo'yicha. */
export function openToothDiagnoses(
  states: ToothStateEntry[],
): { tooth: number; diagnosisId: string | null; state: string }[] {
  const byTooth = new Map<number, { tooth: number; diagnosisId: string | null; state: string }>();
  for (const s of states) {
    const open = s.state === 'caries' || s.state === 'to_extract' || s.diagnosisId != null;
    if (!open) continue;
    const prev = byTooth.get(s.toothNumber);
    // Diagnozga bog'langan yozuv ustun.
    if (!prev || (prev.diagnosisId == null && s.diagnosisId != null)) {
      byTooth.set(s.toothNumber, {
        tooth: s.toothNumber,
        diagnosisId: s.diagnosisId,
        state: s.state,
      });
    }
  }
  return [...byTooth.values()].sort((a, b) => a.tooth - b.tooth);
}

export function OpenDiagnosesBlock({ patientId }: { patientId: string }) {
  const { t, i18n } = useTranslation();
  const chartQuery = useLatestToothChart(patientId);
  const diagnosesQuery = useDiagnoses();
  const lang = i18n.language?.startsWith('ru') ? 'ru' : 'uz';
  const diagnosisMap = useMemo(() => {
    const map = new Map<string, Diagnosis>();
    for (const d of diagnosesQuery.data ?? []) map.set(d.id, d);
    return map;
  }, [diagnosesQuery.data]);

  const title = t('patientCard.diagnoses.title');
  if (isForbiddenError(chartQuery.error)) {
    return (
      <Block titleId="pc-dx-h" title={title}>
        <ForbiddenState />
      </Block>
    );
  }
  if (chartQuery.isLoading) return null;
  // Chart hali yaratilmagan (404) — "ochiq tashxis yo'q"; boshqa xato bo'sh deb yolg'on aytmaydi.
  if (
    chartQuery.isError &&
    !(chartQuery.error instanceof ApiError && chartQuery.error.status === 404)
  ) {
    return (
      <Block titleId="pc-dx-h" title={title}>
        <StateView
          status="error"
          title={t('states.error_title')}
          retryLabel={t('states.retry')}
          onRetry={() => chartQuery.refetch()}
        />
      </Block>
    );
  }
  const rows = openToothDiagnoses(chartQuery.data?.states ?? []);

  return (
    <Block titleId="pc-dx-h" title={title}>
      {rows.length === 0 ? (
        <span className={classes.muted}>{t('patientCard.diagnoses.empty')}</span>
      ) : (
        rows.map((r) => {
          const d = r.diagnosisId ? diagnosisMap.get(r.diagnosisId) : undefined;
          return (
            <div key={r.tooth} className={classes.dx}>
              <b className={classes.dxTooth}>{r.tooth}</b>
              <span className={classes.dxName}>
                {d ? (lang === 'ru' ? d.nameRu : d.nameUz) : t(`tooth_chart.states.${r.state}`)}
              </span>
              {d && <code className={classes.dxCode}>{d.code}</code>}
            </div>
          );
        })
      )}
    </Block>
  );
}
