import { CriticalActionDialog, UpdateBanner } from '@dental/ui';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

type UpdateState = {
  phase: 'ready' | 'installing';
  installAt: string | null;
  role?: 'server' | 'client' | null;
};

/**
 * UI-T3 — desktop yangilanishi. Faqat Electron'da (`window.dentalDesktop.onUpdateState`)
 * chiziladi; brauzerda hech narsa. Yangilanish ish vaqtidan keyin o'rnatiladi,
 * «Hozir o'rnatish» / «Kechqurun» tugmalari main process'ga IPC yuboradi.
 * FX-148 — server PC'da «Hozir o'rnatish» barcha klientlarni uzadi, shuning
 * uchun server rolida avval tasdiq dialogi ko'rsatiladi.
 */
export function DesktopUpdateBanner() {
  const { t } = useTranslation();
  const [state, setState] = useState<UpdateState | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

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
  const installNow = () => void window.dentalDesktop?.installUpdateNow?.();
  return (
    <>
      <UpdateBanner
        title={t('desktopUpdate.title')}
        actions={[
          {
            label: t('desktopUpdate.now'),
            onClick: () => (state.role === 'server' ? setConfirmOpen(true) : installNow()),
          },
          {
            label: t('desktopUpdate.tonight'),
            onClick: () => void window.dentalDesktop?.installUpdateTonight?.(),
          },
        ]}
      >
        {t('desktopUpdate.at', { time })}
      </UpdateBanner>
      <CriticalActionDialog
        opened={confirmOpen}
        title={t('desktopUpdate.serverConfirmTitle')}
        safeLabel={t('desktopUpdate.serverConfirmCancel')}
        dangerLabel={t('desktopUpdate.serverConfirmProceed')}
        onSafe={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          installNow();
        }}
      >
        {t('desktopUpdate.serverConfirmBody')}
      </CriticalActionDialog>
    </>
  );
}
