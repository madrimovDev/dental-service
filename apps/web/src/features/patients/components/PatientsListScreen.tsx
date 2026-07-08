import { Button, Card, IconButton, Input, StateView } from '@dental/ui';
import { Pagination } from '@mantine/core';
import { Archive, Eye, Plus, Search } from 'lucide-react';
import type { MouseEvent } from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
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
  const [search, setSearch] = useState('');
  const [archived, setArchived] = useState(false);
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, refetch } = usePatients({ search, archived, page });
  const archiveMut = useArchivePatient();
  const items = data?.items ?? [];
  const canCreate = hasPermission('patient.create');

  const setFilter = (next: boolean) => {
    setArchived(next);
    setPage(1);
  };

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
              placeholder={t('patients.search_placeholder')}
              value={search}
              onChange={(v) => {
                setSearch(v);
                setPage(1);
              }}
            />
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
