import { useTranslation } from 'react-i18next';
import { dueInfo } from '@/lib/due';
import { formatDay } from '@/lib/format';

export function useDueLabel() {
  const { t, i18n } = useTranslation();
  return (due: string | null, short = true) => {
    const info = dueInfo(due);
    switch (info.kind) {
      case 'none':
        return { info, text: t('labHub.due.none') };
      case 'overdue':
        return { info, text: t('labHub.due.overdue', { n: -info.days }) };
      case 'today':
        return { info, text: t('labHub.due.today') };
      case 'tomorrow':
        return { info, text: t('labHub.due.tomorrow') };
      default:
        return {
          info,
          text: short
            ? formatDay(due as string, i18n.language)
            : `${formatDay(due as string, i18n.language)}`,
        };
    }
  };
}

export function DueChip({ due }: { due: string | null }) {
  const label = useDueLabel()(due);
  return (
    <span className="due" data-kind={label.info.kind}>
      {label.text}
    </span>
  );
}
