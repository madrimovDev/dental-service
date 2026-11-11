import type { Diagnosis } from '@dental/api-client';
import { Mono } from '@dental/ui';
import { Stack, Text, TextInput, UnstyledButton } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDiagnoses } from '../../clinical.api';
import { dxName } from '../../clinical.mappers';

type Props = {
  selected: Diagnosis | null;
  onSelect: (d: Diagnosis | null) => void;
  lang: 'uz' | 'ru';
  /** Kreslo yoni rejimi: natija qatori ≥ --tap-chair. */
  chair?: boolean;
};

/**
 * Tashxis qidiruvi (UI-D3): server tomonida nom (uz/ru) + sinonim + kod, harf xatosiga chidamli.
 * Ro'yxatda NOM birinchi, KOD ikkinchi (mono).
 */
export function DiagnosisPicker({ selected, onSelect, lang, chair = false }: Props) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [debounced] = useDebouncedValue(text, 250);
  const query = useDiagnoses(debounced);
  // Tanlov tozalansa (qo'shildi) — qidiruv matni ham tozalanadi.
  const wasSelected = useRef(false);
  useEffect(() => {
    if (selected) wasSelected.current = true;
    else if (wasSelected.current) {
      wasSelected.current = false;
      setText('');
    }
  }, [selected]);
  // Matn yozilmaguncha natija ko'rsatilmaydi (alifbo ro'yxati panelni cho'zib yuboradi).
  const hasText = debounced.trim().length > 0;
  const results = hasText ? (query.data ?? []).slice(0, 8) : [];
  const minH = chair ? 'var(--tap-chair)' : 'var(--tap-min)';

  return (
    <Stack gap={6}>
      <TextInput
        label={t('odontogram.diagnosis_search')}
        placeholder={t('odontogram.diagnosis_search_placeholder')}
        value={text}
        onChange={(e) => setText(e.currentTarget.value)}
        styles={{ input: { minHeight: minH } }}
      />
      {(hasText || selected) && (
        <Stack
          gap={0}
          role="listbox"
          aria-label={t('odontogram.diagnosis_results')}
          style={{
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md, 8px)',
            overflow: 'hidden',
            background: 'var(--surface)',
          }}
        >
          {results.length === 0 && (
            <Text style={{ padding: 10, fontSize: 13, color: 'var(--ink-3)' }}>
              {t('odontogram.diagnosis_none')}
            </Text>
          )}
          {results.map((d) => {
            const isSel = selected?.id === d.id;
            return (
              <UnstyledButton
                key={d.id}
                type="button"
                role="option"
                aria-selected={isSel}
                onClick={() => onSelect(isSel ? null : d)}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 12px',
                  minHeight: minH,
                  borderBottom: '1px solid var(--border)',
                  background: isSel ? 'var(--primary-soft)' : 'transparent',
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>
                  {dxName(d, lang)}
                </Text>
                <Mono>
                  <Text span style={{ fontSize: 12, color: 'var(--ink-2)' }}>
                    {d.code}
                  </Text>
                </Mono>
              </UnstyledButton>
            );
          })}
        </Stack>
      )}
      <Text style={{ fontSize: 12, color: 'var(--ink-3)' }}>{t('odontogram.diagnosis_hint')}</Text>
    </Stack>
  );
}
