import { type ConnectionStatusKind, deriveConnectionStatus } from '@dental/ui';
import { useSyncExternalStore } from 'react';
import { useLicenseStatus } from '@/features/license';

function subscribeOnline(cb: () => void): () => void {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
}

/**
 * Menyu pastidagi ulanish holati. Server `GET /license/status` ga javob bermasa — `noserver`;
 * brauzer oflayn — `offline`; aks holda rejimga qarab `lan` (desktop) / `cloud`.
 * Birinchi javobgacha `null` (miltillash yo'q).
 */
export function useConnectionKind(): ConnectionStatusKind | null {
  const { data, isError } = useLicenseStatus();
  const online = useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
  if (isError) return 'noserver';
  if (!data) return null;
  return deriveConnectionStatus({ mode: data.mode, online, serverReachable: true });
}
