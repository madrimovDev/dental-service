import {
  Avatar,
  Button,
  Card,
  IconButton,
  Input,
  Mono,
  PageHead,
  StateView,
  Tag,
} from '@dental/ui';
import { Pagination, Switch } from '@mantine/core';
import { Archive, Eye, Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { BalanceBadge } from '@/components/BalanceBadge';
import { useAuthStore } from '@/stores/auth-store.ts';
import { useArchivePatient, usePatients } from '../patients.api';
import classes from './PatientsListScreen.module.css';

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

  return (
    <div>
      <PageHead
        title={t('patients.title')}
        actions={
          hasPermission('patient.create') && (
            <Button
              variant="primary"
              iconLeft={<Plus size={16} />}
              onClick={() => navigate('/patients/new')}
            >
              {t('patients.create')}
            </Button>
          )
        }
      />

      <div className={classes.toolbar}>
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
        <Switch
          label={t('patients.show_archived')}
          checked={archived}
          onChange={(e) => {
            setArchived(e.currentTarget.checked);
            setPage(1);
          }}
        />
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
          title={t('states.empty_title')}
          description={t('patients.empty')}
        />
      ) : (
        <Card bodyless>
          {items.map((p) => (
            <div key={p.id} className={classes.row}>
              <Avatar name={p.fullName} size="md" />
              <div className={classes.identity}>
                <div className={classes.name}>{p.fullName}</div>
                {p.phone && <Mono>{p.phone}</Mono>}
              </div>
              {p.tags.map((tg) => (
                <Tag key={tg}>{tg}</Tag>
              ))}
              <span title={t('patients.balance')}>
                <BalanceBadge balance={p.balance} />
              </span>
              {p.age != null && <span className={classes.age}>{p.age}</span>}
              <IconButton label={t('common.view')} onClick={() => navigate(`/patients/${p.id}`)}>
                <Eye size={16} />
              </IconButton>
              {hasPermission('patient.delete') && (
                <IconButton
                  label={t('common.archive')}
                  disabled={archiveMut.isPending}
                  onClick={() => archiveMut.mutate(p.id)}
                >
                  <Archive size={16} />
                </IconButton>
              )}
            </div>
          ))}
        </Card>
      )}

      {data && data.meta.total > data.meta.pageSize && (
        <Pagination
          total={Math.ceil(data.meta.total / data.meta.pageSize)}
          value={page}
          onChange={setPage}
          mt="md"
        />
      )}
    </div>
  );
}
