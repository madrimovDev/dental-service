import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatMoney } from '@/lib/format';
import { usePropose } from '../cases.api';
import type { CaseDto, PriceItem } from '../cases.types';

export function PricePanel({
  c,
  items,
  canPropose,
}: {
  c: CaseDto;
  items: PriceItem[];
  canPropose: boolean;
}) {
  const { t, i18n } = useTranslation();
  const cur = t('labHub.common.currency');
  const [itemId, setItemId] = useState('');
  const [price, setPrice] = useState(c.proposedPrice ? String(Number(c.proposedPrice)) : '');
  const propose = usePropose(c.id);
  const approved = c.approvedPrice;

  if (approved !== null) {
    return (
      <div className="price-box">
        <span className="section-title">{t('labHub.detail.price')}</span>
        <b>
          {t('labHub.detail.priceApproved', {
            price: formatMoney(approved, i18n.language, cur),
          })}
        </b>
        <span className="muted">{t('labHub.detail.priceLocked')}</span>
      </div>
    );
  }

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const n = Number(price);
    if (!Number.isFinite(n) || n <= 0) return;
    propose.mutate({ price: n, ...(itemId ? { priceListItemId: itemId } : {}) });
  };

  return (
    <div className="price-box">
      <span className="section-title">{t('labHub.detail.price')}</span>
      {c.proposedPrice && (
        <div>
          <b>
            {t('labHub.detail.priceProposed', {
              price: formatMoney(c.proposedPrice, i18n.language, cur),
            })}
          </b>
          <div className="muted">{t('labHub.detail.priceWaiting')}</div>
        </div>
      )}
      {canPropose && (
        <form onSubmit={submit} className="price-box__row">
          <div className="field">
            <label htmlFor="price-item">{t('labHub.detail.priceFromList')}</label>
            <select
              id="price-item"
              className="input"
              value={itemId}
              onChange={(e) => {
                setItemId(e.target.value);
                const it = items.find((x) => x.id === e.target.value);
                if (it) setPrice(String(Number(it.price)));
              }}
            >
              <option value="">—</option>
              {items
                .filter((i) => i.isActive)
                .map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.material ? `${i.workType} · ${i.material}` : i.workType} ·{' '}
                    {formatMoney(i.price, i18n.language, cur)}
                  </option>
                ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="price-input">{t('labHub.detail.priceInput')}</label>
            <input
              id="price-input"
              className="input"
              type="number"
              min={0}
              step="any"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </div>
          <button
            type="submit"
            className="btn btn--primary"
            disabled={propose.isPending || !Number(price)}
          >
            {t('labHub.detail.pricePropose')}
          </button>
        </form>
      )}
    </div>
  );
}
