import { UpdateBanner } from '@dental/ui';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

type UpdateState = { phase: 'ready' | 'installing'; installAt: string | null };

/**
 * UI-T3 — desktop yangilanishi. Faqat Electron'da (`window.dentalDesktop.onUpdateState`)
 * chiziladi; brauzerda hech narsa. Yangilanish ish vaqtidan keyin o'rnatiladi,
 * «Hozir o'rnatish» / «Kechqurun» tugmalari main process'ga IPC yuboradi.
 */
export function DesktopUpdateBanner() {
  const { t } = useTranslation();
  const [state, setState] = useState<UpdateState | null>(null);

  useEffect(() => {
    const unsubscribe = window.dentalDesktop?.onUpdateState?.(setState);
    return () => unsubscribe?.();
  }, []);

  if (!state) return null;
  if (state.phase === 'installing') {
    return <UpdateBanner title={t('desktopUpdate.installing')}>{null}</UpdateBanner>;
  }
  const time = state.installAt
    ? new Date(state.installAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';
  return (
    <UpdateBanner
      title={t('desktopUpdate.title')}
      actions={[
        {
          label: t('desktopUpdate.now'),
          onClick: () => void window.dentalDesktop?.installUpdateNow?.(),
        },
        {
          label: t('desktopUpdate.tonight'),
          onClick: () => void window.dentalDesktop?.installUpdateTonight?.(),
        },
      ]}
    >
      {t('desktopUpdate.at', { time })}
    </UpdateBanner>
  );
}
