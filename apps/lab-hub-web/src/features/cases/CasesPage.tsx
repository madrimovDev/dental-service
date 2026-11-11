import { StateView } from '@dental/ui';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { localISODate } from '@/lib/due';
import { useAuth } from '@/stores/auth';
import { useAllCases, useCases, useLabUsers } from './cases.api';
import { isOpen } from './cases.mappers';
import { TAB_KEYS, type TabKey } from './cases.types';
import { CaseDetailPanel } from './components/CaseDetailPanel';
import { CaseRow } from './components/CaseRow';

type DueFilter = 'all' | 'today' | 'week';

export function CasesPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const user = useAuth((s) => s.user);
  const lab = useAuth((s) => s.lab);

  const tab = (
    TAB_KEYS.includes(params.get('tab') as TabKey) ? params.get('tab') : 'new'
  ) as TabKey;
  const tech = params.get('tech') ?? '';
  const dueFilter = (params.get('due') ?? 'all') as DueFilter;
  const selected = params.get('case');

  const dueBefore =
    dueFilter === 'today'
      ? localISODate()
      : dueFilter === 'week'
        ? localISODate(new Date(), 7)
        : undefined;

  const list = useCases({ tab, technicianId: tech || undefined, dueBefore });
  const all = useAllCases();
  const users = useLabUsers(true);

  const setParam = (k: string, v: string | null) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        if (v) n.set(k, v);
        else n.delete(k);
        return n;
      },
      { replace: true },
    );

  const techName = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of users.data?.users ?? []) m.set(u.id, u.fullName);
    if (user) m.set(user.id, user.fullName);
    return m;
  }, [users.data, user]);

  const summary = useMemo(() => {
    const open = (all.data?.cases ?? []).filter(isOpen);
    const today = localISODate();
    return {
      open: open.length,
      clinics: new Set(open.map((c) => c.clinicId)).size,
      today: open.filter((c) => c.dueDate && c.dueDate <= today).length,
    };
  }, [all.data]);

  const counts = list.data?.tabCounts ?? all.data?.tabCounts;
  const techOptions = (users.data?.users ?? []).filter((u) => u.isActive);

  return (
    <>
      <header className="page-head">
        <div className="page-head__title">
          <h1>{t('labHub.cases.title', { lab: lab?.name ?? '' })}</h1>
          <span className="page-head__sub">
            {t('labHub.cases.summary', {
              clinics: summary.clinics,
              open: summary.open,
              today: summary.today,
            })}
          </span>
        </div>
        <select
          className="select-chip"
          aria-label={t('labHub.cases.dueFilter.label')}
          data-active={dueFilter !== 'all'}
          value={dueFilter}
          onChange={(e) => setParam('due', e.target.value === 'all' ? null : e.target.value)}
        >
          <option value="all">{t('labHub.cases.dueFilter.all')}</option>
          <option value="today">{t('labHub.cases.dueFilter.today')}</option>
          <option value="week">{t('labHub.cases.dueFilter.week')}</option>
        </select>
        <select
          className="select-chip"
          aria-label={t('labHub.cases.techFilter')}
          data-active={!!tech}
          value={tech}
          onChange={(e) => setParam('tech', e.target.value || null)}
        >
          <option value="">{t('labHub.cases.techAll')}</option>
          {techOptions.map((u) => (
            <option key={u.id} value={u.id}>
              {u.id === user?.id ? `${u.fullName} ${t('labHub.staff.you')}` : u.fullName}
            </option>
          ))}
        </select>
      </header>

      <div className="page-body">
        <div className="cases">
          <section className="cases__list" aria-label={t('labHub.cases.listLabel')}>
            <div role="tablist" aria-label={t('labHub.cases.tabsLabel')} className="tabs">
              {TAB_KEYS.map((k) => (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  className="tab"
                  aria-selected={tab === k}
                  onClick={() => setParam('tab', k === 'new' ? null : k)}
                >
                  {t(`labHub.cases.tabs.${k}`)} <b>{counts?.[k] ?? 0}</b>
                </button>
              ))}
            </div>

            {list.isLoading && <StateView status="loading" skeleton="table" />}
            {list.isError && (
              <StateView
                status="error"
                title={t('labHub.common.loadError')}
                onRetry={() => void list.refetch()}
                retryLabel={t('labHub.app.retry')}
              />
            )}
            {list.data && list.data.cases.length === 0 && (
              <StateView
                status="empty"
                title={t('labHub.cases.empty')}
                description={t('labHub.cases.emptyHint')}
              />
            )}
            {list.data?.cases.map((c) => (
              <CaseRow
                key={c.id}
                c={c}
                selected={selected === c.id}
                techName={c.assignedTechnicianId ? techName.get(c.assignedTechnicianId) : undefined}
                onSelect={() => setParam('case', c.id)}
              />
            ))}
          </section>

          {selected ? (
            <CaseDetailPanel key={selected} id={selected} />
          ) : (
            <div className="detail detail--empty">{t('labHub.cases.pickCase')}</div>
          )}
        </div>
      </div>
    </>
  );
}
