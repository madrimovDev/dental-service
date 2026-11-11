import { Stack, Text, UnstyledButton } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { QUESTION_GROUPS, QUESTIONS, type QuestionKey, questionLock } from '../reports.questions';

type Props = {
  active: QuestionKey;
  allowAllBranches: boolean;
  onSelect: (key: QuestionKey) => void;
};

/** Savollar ro'yxati (kanvas: guruh sarlavhasi + 44px balandlikdagi punktlar). Yopiq savol — `aria-disabled`. */
export function QuestionNav({ active, allowAllBranches, onSelect }: Props) {
  const { t } = useTranslation();
  return (
    <nav aria-label={t('reportsQ.nav')}>
      <Stack gap="md">
        {QUESTION_GROUPS.map((g) => (
          <Stack key={g} gap={2}>
            <Text
              fz={12}
              fw={700}
              tt="uppercase"
              c="dimmed"
              px={10}
              pb={4}
              style={{ letterSpacing: '.05em' }}
            >
              {t(`reportsQ.group.${g}`)}
            </Text>
            {QUESTIONS.filter((q) => q.group === g).map((q) => {
              const lock = questionLock(q, allowAllBranches);
              const isActive = q.key === active;
              return (
                <UnstyledButton
                  key={q.key}
                  type="button"
                  aria-current={isActive ? 'page' : undefined}
                  aria-disabled={lock ? true : undefined}
                  title={lock === 'clinicWide' ? t('reportsQ.lockHint.clinicWide') : undefined}
                  onClick={() => {
                    if (!lock) onSelect(q.key);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    minHeight: 44,
                    padding: '0 10px',
                    borderRadius: 8,
                    fontSize: 15,
                    fontWeight: isActive ? 700 : 400,
                    background: isActive ? 'var(--primary-tint)' : 'transparent',
                    color: isActive
                      ? 'var(--primary-strong)'
                      : lock
                        ? 'var(--text-3, var(--ink-3))'
                        : 'var(--text)',
                    cursor: lock ? 'not-allowed' : 'pointer',
                  }}
                >
                  <span>{t(`reportsQ.q.${q.key}`)}</span>
                  {lock && (
                    <span
                      style={{
                        flexShrink: 0,
                        whiteSpace: 'nowrap',
                        fontSize: 11,
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        padding: '2px 8px',
                        borderRadius: 99,
                        background: 'var(--surface-2)',
                        color: 'var(--text-2)',
                      }}
                    >
                      {t(`reportsQ.lock.${lock}`)}
                    </span>
                  )}
                </UnstyledButton>
              );
            })}
          </Stack>
        ))}
      </Stack>
    </nav>
  );
}
