import { StateView, StatusPill } from '@dental/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { useAuth } from '@/stores/auth';
import { usePriceList } from '../cases/cases.api';
import { caseKeys } from '../cases/cases.keys';
import type { PriceItem } from '../cases/cases.types';

type Draft = { id?: string; workType: string; material: string; price: string; isActive: boolean };
const EMPTY: Draft = { workType: '', material: '', price: '', isActive: true };

export function PricesPage() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const isLead = useAuth((s) => s.user?.role === 'lead');
  const list = usePriceList(true);
  const cur = t('labHub.common.currency');
  const [draft, setDraft] = useState<Draft | null>(null);

  const save = useMutation({
    mutationFn: (d: Draft) => {
      const body = {
        workType: d.workType.trim(),
        material: d.material.trim() || null,
        price: Number(d.price),
        isActive: d.isActive,
      };
      return d.id
        ? api.patch(`/v1/lab/price-list/${d.id}`, body)
        : api.post('/v1/lab/price-list', body);
    },
    onSuccess: () => {
      setDraft(null);
      return qc.invalidateQueries({ queryKey: caseKeys.prices });
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/v1/lab/price-list/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: caseKeys.prices }),
  });
  const toggle = useMutation({
    mutationFn: (it: PriceItem) =>
      api.patch(`/v1/lab/price-list/${it.id}`, { isActive: !it.isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: caseKeys.prices }),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (draft?.workType.trim() && Number(draft.price) > 0) save.mutate(draft);
  };

  const items = list.data?.items ?? [];
  return (
    <>
      <header className="page-head">
        <div className="page-head__title">
          <h1>{t('labHub.prices.title')}</h1>
          <span className="page-head__sub">{t('labHub.prices.subtitle')}</span>
        </div>
        {isLead && (
          <button type="button" className="btn btn--primary" onClick={() => setDraft({ ...EMPTY })}>
            {t('labHub.prices.add')}
          </button>
        )}
      </header>
      <div className="page-body">
        {draft && (
          <form
            className="card"
            onSubmit={submit}
            aria-label={draft.id ? t('labHub.prices.formEdit') : t('labHub.prices.formAdd')}
          >
            <h2>{draft.id ? t('labHub.prices.formEdit') : t('labHub.prices.formAdd')}</h2>
            <div className="inline-form">
              <div className="field">
                <label htmlFor="pl-type">{t('labHub.prices.workType')}</label>
                <input
                  id="pl-type"
                  className="input"
                  value={draft.workType}
                  maxLength={200}
                  onChange={(e) => setDraft({ ...draft, workType: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="pl-material">{t('labHub.prices.material')}</label>
                <input
                  id="pl-material"
                  className="input"
                  value={draft.material}
                  maxLength={200}
                  onChange={(e) => setDraft({ ...draft, material: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="pl-price">{t('labHub.prices.price')}</label>
                <input
                  id="pl-price"
                  className="input"
                  type="number"
                  min={0}
                  step="any"
                  value={draft.price}
                  onChange={(e) => setDraft({ ...draft, price: e.target.value })}
                />
              </div>
            </div>
            <div className="actions">
              <button
                type="submit"
                className="btn btn--primary"
                disabled={save.isPending || !draft.workType.trim() || !(Number(draft.price) > 0)}
              >
                {t('labHub.common.save')}
              </button>
              <button type="button" className="btn" onClick={() => setDraft(null)}>
                {t('labHub.common.cancel')}
              </button>
            </div>
          </form>
        )}
        <section className="card">
          {list.isLoading && <StateView status="loading" skeleton="table" />}
          {list.isError && (
            <StateView
              status="error"
              title={t('labHub.common.loadError')}
              onRetry={() => void list.refetch()}
              retryLabel={t('labHub.app.retry')}
            />
          )}
          {list.data && items.length === 0 && (
            <StateView
              status="empty"
              title={t('labHub.prices.empty')}
              description={t('labHub.prices.emptyHint')}
            />
          )}
          {items.length > 0 && (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('labHub.prices.workType')}</th>
                    <th>{t('labHub.prices.material')}</th>
                    <th className="num">{t('labHub.prices.price')}</th>
                    <th>{t('labHub.prices.status')}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={it.id}>
                      <td>
                        <b>{it.workType}</b>
                      </td>
                      <td>{it.material ?? '—'}</td>
                      <td className="num">{formatMoney(it.price, i18n.language, cur)}</td>
                      <td>
                        <StatusPill status={it.isActive ? 'confirmed' : 'done'}>
                          {it.isActive ? t('labHub.prices.active') : t('labHub.prices.inactive')}
                        </StatusPill>
                      </td>
                      <td>
                        {isLead && (
                          <div className="actions" style={{ justifyContent: 'flex-end' }}>
                            <button
                              type="button"
                              className="btn btn--sm"
                              onClick={() => toggle.mutate(it)}
                            >
                              {it.isActive
                                ? t('labHub.prices.deactivate')
                                : t('labHub.prices.activate')}
                            </button>
                            <button
                              type="button"
                              className="btn btn--sm"
                              onClick={() =>
                                setDraft({
                                  id: it.id,
                                  workType: it.workType,
                                  material: it.material ?? '',
                                  price: String(Number(it.price)),
                                  isActive: it.isActive,
                                })
                              }
                            >
                              {t('labHub.common.edit')}
                            </button>
                            <button
                              type="button"
                              className="btn btn--danger btn--sm"
                              onClick={() => {
                                if (window.confirm(t('labHub.prices.deleteConfirm')))
                                  remove.mutate(it.id);
                              }}
                            >
                              {t('labHub.common.delete')}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
