import { searchVariants } from '@dental/core';
import { Button, Card, IconButton, Input, PatientFlag, StateView } from '@dental/ui';
import { Pagination } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { Archive, Eye, Plus, Search } from 'lucide-react';
import type { MouseEvent } from 'react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth-store.ts';
import { useArchivePatient, usePatients } from '../patients.api';
import { BalanceChip } from './BalanceChip';
import classes from './PatientsListScreen.module.css';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  const first = parts[0]?.[0] ?? '';
  if (parts.length === 1) return first.toUpperCase();
  const last = parts[parts.length - 1]?.[0] ?? '';
  return (first + last).toUpperCase();
}

export function PatientsListScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { hasPermission } = useAuthStore();
  // Filtrlar URL'da — bemor kartasidan qaytganda qidiruv/sahifa saqlanadi (UI-1 qoidasi).
  const [searchParams, setSearchParams] = useSearchParams();
  const urlSearch = searchParams.get('q') ?? '';
  const archived = searchParams.get('archived') === '1';
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const [searchInput, setSearchInput] = useState(urlSearch);
  const [search] = useDebouncedValue(searchInput.trim(), 300);
  // URL tashqaridan o'zgarsa (havola, orqaga) — kiritish maydonini moslash.
  // biome-ignore lint/correctness/useExhaustiveDependencies: faqat URL o'zgarganda sinxronlanadi
  useEffect(() => {
    if (urlSearch !== searchInput.trim()) setSearchInput(urlSearch);
  }, [urlSearch]);
  const { data, isLoading, isError, refetch } = usePatients({ search, archived, page });
  const archiveMut = useArchivePatient();
  const items = data?.items ?? [];
  const canCreate = hasPermission('patient.create');
  const canBook = hasPermission('appointment.create');
  // PT-03: telefon/passport bo'yicha qidiruv faqat view_pii bilan ishlaydi — placeholder buni aytadi.
  const canSearchPii = hasPermission('patient.view_pii');
  // Kirill↔lotin: qidiruv o'zgartirilgan variantni ham topishini ko'rsatamiz.
  const alsoVariant = searchVariants(searchInput)[1];

  const updateParams = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '') next.delete(k);
      else next.set(k, v);
    }
    setSearchParams(next, { replace: true });
  };
  const setPage = (p: number) => updateParams({ page: p > 1 ? String(p) : null });
  const onSearch = (v: string) => {
    setSearchInput(v);
    updateParams({ q: v.trim() || null, page: null });
  };
  const setFilter = (next: boolean) => updateParams({ archived: next ? '1' : null, page: null });

  return (
    <div>
      <div className={classes.header}>
        <div>
          {data && (
            <div className={classes.headSub}>{t('patients.count', { count: data.meta.total })}</div>
          )}
        </div>
        <div className={classes.headRight}>
          <div className={classes.searchField}>
            <Input
              icon={<Search size={16} />}
              placeholder={
                canSearchPii
                  ? t('patients.search_placeholder')
                  : t('patientsList.search_placeholder_name')
              }
              value={searchInput}
              onChange={onSearch}
            />
            {alsoVariant && (
              <div className={classes.alsoFound}>
                {t('patientsList.also_found', { variant: alsoVariant })}
              </div>
            )}
          </div>
          {canCreate && (
            <Button
              variant="primary"
              iconLeft={<Plus size={16} />}
              onClick={() => navigate('/patients/new')}
            >
              {t('patients.create')}
            </Button>
          )}
        </div>
      </div>

      <div className={classes.pills}>
        <button
          type="button"
          className={classes.pill}
          data-active={!archived}
          onClick={() => setFilter(false)}
        >
          {t('patients.filter.all')}
        </button>
        <button
          type="button"
          className={classes.pill}
          data-active={archived}
          onClick={() => setFilter(true)}
        >
          {t('patients.filter.archived')}
        </button>
      </div>

      {isLoading ? (
        <StateView status="loading" skeleton="table" />
      ) : isError ? (
        <StateView
          status="error"
          title={t('states.error_title')}
          retryLabel={t('states.retry')}
          onRetry={() => refetch()}
        />
      ) : items.length === 0 ? (
        <StateView
          status="empty"
          icon={<Search size={26} />}
          title={t('patients.empty_title')}
          description={t('patients.empty_desc')}
          action={
            canCreate ? (
              <Button
                variant="primary"
                iconLeft={<Plus size={16} />}
                onClick={() => navigate('/patients/new')}
              >
                {t('patients.create')}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Card bodyless>
          <div className={classes.tableHead}>
            <span>{t('patients.col.patient')}</span>
            <span>{t('patients.col.phone')}</span>
            <span>{t('patients.col.age_gender')}</span>
            <span className={classes.colBalance}>{t('patients.col.balance')}</span>
          </div>
          {items.map((p) => (
            // biome-ignore lint/a11y/useSemanticElements: grid row carries nested action buttons; a <button> cannot wrap them (invalid HTML)
            <div
              key={p.id}
              className={classes.row}
              role="button"
              tabIndex={0}
              onClick={() => navigate(`/patients/${p.id}`)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') navigate(`/patients/${p.id}`);
              }}
            >
              <div className={classes.patientCell}>
                <span className={classes.avatar} aria-hidden>
                  {initials(p.fullName)}
                </span>
                <div className={classes.identity}>
                  <div className={classes.nameRow}>
                    <span className={classes.name}>{p.fullName}</span>
                    {p.tags[0] && <span className={classes.tagPill}>{p.tags[0]}</span>}
                  </div>
                  {/* UI-R6: belgilar — rang + MATN (faqat rangga tayanilmaydi). */}
                  {(p.flags.allergy || p.flags.debt || p.flags.noShows > 0 || p.flags.telegram) && (
                    <div className={classes.flags}>
                      {p.flags.allergy && (
                        <PatientFlag level="critical">{t('patientsList.flag_allergy')}</PatientFlag>
                      )}
                      {p.flags.debt && (
                        <PatientFlag level="attention">{t('patientsList.flag_debt')}</PatientFlag>
                      )}
                      {p.flags.noShows > 0 && (
                        // CLI-474 (L7): chegaradan oshgan bo'lsa (`flagged`) — qizil daraja.
                        <PatientFlag level={p.flagged ? 'critical' : 'attention'}>
                          {t('patientsList.flag_no_shows', { count: p.flags.noShows })}
                        </PatientFlag>
                      )}
                      {p.flags.telegram && (
                        <PatientFlag level="info">{t('patientsList.flag_telegram')}</PatientFlag>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {p.phone ? (
                <span className={classes.phone}>{p.phone}</span>
              ) : (
                <span className={classes.empty}>—</span>
              )}

              <span className={classes.ageGender}>
                {p.age != null ? `${p.age} · ${p.genderLabel}` : p.genderLabel || '—'}
              </span>

              <div className={classes.balanceCell}>
                <BalanceChip balance={p.balance} />
                <div className={classes.rowActions}>
                  {/* Har qatorda bitta asosiy amal — yozilish. */}
                  {!archived && canBook && (
                    <Button
                      size="sm"
                      variant="default"
                      onClick={(e: MouseEvent<HTMLButtonElement>) => {
                        e.stopPropagation();
                        navigate(`/appointments/new?patientId=${p.id}`);
                      }}
                    >
                      {t('patientsList.book')}
                    </Button>
                  )}
                  <IconButton
                    label={t('common.view')}
                    onClick={(e: MouseEvent<HTMLButtonElement>) => {
                      e.stopPropagation();
                      navigate(`/patients/${p.id}`);
                    }}
                  >
                    <Eye size={16} />
                  </IconButton>
                  {/* L11: arxivlangan ro'yxatda "Arxivlash" ma'nosiz — unarchive endpoint yo'q */}
                  {!archived && hasPermission('patient.delete') && (
                    <IconButton
                      label={t('common.archive')}
                      disabled={archiveMut.isPending}
                      onClick={(e: MouseEvent<HTMLButtonElement>) => {
                        e.stopPropagation();
                        archiveMut.mutate(p.id);
                      }}
                    >
                      <Archive size={16} />
                    </IconButton>
                  )}
                </div>
              </div>
            </div>
          ))}
        </Card>
      )}

      {data && data.meta.total > data.meta.pageSize && (
        <Pagination
          className={classes.pagination}
          total={Math.ceil(data.meta.total / data.meta.pageSize)}
          value={page}
          onChange={setPage}
        />
      )}
    </div>
  );
}
