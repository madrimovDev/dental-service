import type { Diagnosis, Service } from '@dental/api-client';
import { Mono } from '@dental/ui';
import { Box, Select, Text, UnstyledButton } from '@mantine/core';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { formatNumber } from '@/lib/format';
import { useAuthStore } from '@/stores/auth-store.ts';
import { fetchServicePrices, useServiceCatalog } from '../../clinical.api';
import { findActivePrice } from '../../clinical.mappers';
import { suggestServices } from './treatment-suggest';

export type SuggestedService = { id: string; name: string; cost: number | null };

type Props = {
  /** Tanlangan yoki tishdagi birinchi tashxis (taklif shunga qarab tuziladi). */
  diagnosis: Diagnosis | null;
  lang: 'uz' | 'ru';
  chair: boolean;
  value: SuggestedService | null;
  onChange: (next: SuggestedService | null) => void;
};

const sectionLabel = {
  fontSize: 11,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.06em',
  color: 'var(--ink-3)',
  fontWeight: 600,
  marginBottom: 6,
};

const svcName = (s: Service, lang: 'uz' | 'ru') =>
  lang === 'ru' && s.nameRu ? s.nameRu : s.nameUz;

/**
 * «Davolash taklifi» (Tish xaritasi kanvasi): tashxisga mos xizmatlar + filial narxi (radio),
 * tanlangani «Rejaga qo'shish»da bosqichga serviceId/narx bilan tushadi. `service.view` bo'lmasa
 * umuman chizilmaydi (keraksiz 403 yo'q).
 */
export function TreatmentSuggestions({ diagnosis, lang, chair, value, onChange }: Props) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const canViewServices = useAuthStore((s) => s.hasPermission('service.view'));
  const branchId = useAuthStore((s) => s.activeBranchId);
  const catalog = useServiceCatalog(canViewServices);
  const services = catalog.data ?? [];

  const suggested = useMemo(
    () => suggestServices(diagnosis, services, lang),
    [diagnosis, services, lang],
  );
  // Tanlangan xizmat taklif ro'yxatida bo'lmasa (qo'lda tanlangan) ham narxi olinadi.
  const shown = useMemo(() => {
    const picked = value ? services.find((s) => s.id === value.id) : undefined;
    return picked && !suggested.some((s) => s.id === picked.id)
      ? [...suggested, picked]
      : suggested;
  }, [suggested, services, value]);

  const prices = useQueries({
    queries: shown.map((s) => ({
      queryKey: ['clinical', 'odontogram-svc-price', s.id, branchId],
      queryFn: () =>
        fetchServicePrices(qc, s.id).then((d) =>
          branchId ? findActivePrice(d.prices, branchId) : null,
        ),
      staleTime: 5 * 60_000,
    })),
  });
  const priceOf = (i: number): number | null => prices[i]?.data ?? null;

  if (!canViewServices || !diagnosis) return null;
  const minH = chair ? 'var(--tap-chair)' : 'var(--tap-min)';

  const pick = (s: Service, cost: number | null) =>
    onChange({ id: s.id, name: svcName(s, lang), cost });

  return (
    <Box
      data-testid="treatment-suggestions"
      style={{ background: 'var(--surface-2)', borderRadius: 10, padding: 12 }}
    >
      <Text style={sectionLabel}>{t('odontogram.suggest_title')}</Text>
      {shown.length === 0 ? (
        <Text style={{ fontSize: 13, color: 'var(--ink-3)' }}>{t('odontogram.suggest_none')}</Text>
      ) : (
        <Box role="radiogroup" aria-label={t('odontogram.suggest_title')}>
          {shown.map((s, i) => {
            const selected = value?.id === s.id;
            const cost = priceOf(i);
            return (
              <UnstyledButton
                key={s.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => (selected ? onChange(null) : pick(s, cost))}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  width: '100%',
                  minHeight: minH,
                  padding: '6px 4px',
                  color: 'var(--ink)',
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: '50%',
                    flexShrink: 0,
                    border: selected
                      ? '5px solid var(--primary)'
                      : '2px solid var(--border-strong)',
                    background: 'var(--surface)',
                  }}
                />
                <span style={{ flex: 1, fontSize: 14 }}>{svcName(s, lang)}</span>
                <Mono>
                  <Text span style={{ fontSize: 13, fontWeight: 600 }}>
                    {cost != null ? formatNumber(cost) : t('odontogram.suggest_no_price')}
                  </Text>
                </Mono>
              </UnstyledButton>
            );
          })}
        </Box>
      )}
      <Select
        mt={8}
        searchable
        clearable
        size="xs"
        aria-label={t('odontogram.suggest_other')}
        placeholder={t('odontogram.suggest_other')}
        data={services
          .filter((s) => s.isActive)
          .map((s) => ({ value: s.id, label: svcName(s, lang) }))}
        value={value && !suggested.some((s) => s.id === value.id) ? value.id : null}
        onChange={(id) => {
          const s = services.find((x) => x.id === id);
          if (!s) return onChange(null);
          fetchServicePrices(qc, s.id)
            .then((d) => (branchId ? findActivePrice(d.prices, branchId) : null))
            .catch(() => null)
            .then((cost) => pick(s, cost));
        }}
        styles={{ input: { minHeight: minH } }}
      />
    </Box>
  );
}
