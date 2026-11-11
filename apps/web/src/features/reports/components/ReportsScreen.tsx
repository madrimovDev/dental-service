import { PageHead } from '@dental/ui';
import { Alert, Card, Group, Select, Stack, Text } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { useReportBranches } from '../reports.api';
import {
  fromLocalDate,
  parseReportParams,
  readStoredParams,
  toLocalDate,
  toSearchParams,
  writeStoredParams,
} from '../reports.params';
import { type QuestionKey, resolveQuestion } from '../reports.questions';
import type { ReportRange } from '../reports.types';
import { QuestionAnswer } from './QuestionAnswer';
import { QuestionNav } from './QuestionNav';

/**
 * UI-M2 — Hisobotlar: savollar ro'yxati → bir gaplik javob → grafik → jadval.
 * Davr, filial va savol URL'da. Filial doirasi SERVERda majburlanadi (IR-06); bu yerda
 * faqat selektor ruxsat etilgan filiallar bilan cheklanadi.
 */
export function ReportsScreen() {
  const { t } = useTranslation();
  const [sp, setSp] = useSearchParams();
  const wsBranches = useReportBranches();

  // Filial ma'lumoti kelmaguncha so'rov yubormaymiz (fail-closed UI).
  const ready = !!wsBranches.data;
  const allowAll = wsBranches.data?.allowAllBranches ?? false;
  const branchList = wsBranches.data?.branches ?? [];

  const params = useMemo(() => parseReportParams(sp, readStoredParams()), [sp]);
  const branchId =
    params.branchId && branchList.some((b) => b.id === params.branchId) ? params.branchId : null;
  const question = resolveQuestion(params.q, allowAll);

  // URL bo'sh bo'lsa (oxirgi tanlov / default) — URL'ga yozamiz, bo'lishish/qayta yuklash uchun.
  useEffect(() => {
    if (ready && (!sp.has('from') || !sp.has('to'))) {
      setSp(toSearchParams({ ...params, branchId }), { replace: true });
    }
  }, [ready, sp, params, branchId, setSp]);

  const update = (patch: Partial<typeof params>) => {
    const next = { ...params, branchId, q: question.key, ...patch };
    writeStoredParams(next);
    setSp(toSearchParams(next), { replace: true });
  };

  const range: ReportRange = { from: params.from, to: params.to, branchId: branchId ?? undefined };

  const singleBranch = !allowAll && branchList.length === 1;
  const branchData = branchList.map((b) => ({ value: b.id, label: b.name }));

  return (
    <Stack gap="lg">
      <PageHead title={t('reports.title')} />

      <Card withBorder padding="md" radius="lg">
        <Group align="end" gap="md" wrap="wrap">
          <DatePickerInput
            type="range"
            label={t('reportsQ.period')}
            value={[fromLocalDate(params.from), fromLocalDate(params.to)]}
            onChange={([f, to]) => {
              if (f && to) update({ from: toLocalDate(f), to: toLocalDate(to) });
            }}
            valueFormat="DD.MM.YYYY"
            allowSingleDateInRange
            style={{ minWidth: 260 }}
          />
          <Select
            label={t('reportsQ.branch')}
            aria-label={t('reportsQ.branch')}
            placeholder={allowAll ? t('reportsQ.allBranches') : t('reportsQ.myBranches')}
            clearable={!singleBranch}
            disabled={!ready || singleBranch}
            value={singleBranch ? (branchList[0]?.id ?? null) : branchId}
            onChange={(v) => update({ branchId: v })}
            data={branchData}
            style={{ minWidth: 220 }}
          />
          <Text size="sm" c="dimmed" pb={8}>
            {t('reportsQ.saved')}
          </Text>
        </Group>
      </Card>

      {ready && !allowAll && (
        <Alert color="blue" variant="light" data-testid="report-scope-note">
          {t('reportsQ.scopeNote')}
        </Alert>
      )}

      <Group align="flex-start" gap="lg" wrap="wrap">
        <div style={{ flex: '1 1 260px', maxWidth: 300, minWidth: 240 }}>
          <QuestionNav
            active={question.key}
            allowAllBranches={allowAll}
            onSelect={(key: QuestionKey) => update({ q: key })}
          />
        </div>
        <div style={{ flex: '999 1 520px', minWidth: 0 }}>
          <QuestionAnswer question={question.key} range={range} ready={ready} />
        </div>
      </Group>
    </Stack>
  );
}
