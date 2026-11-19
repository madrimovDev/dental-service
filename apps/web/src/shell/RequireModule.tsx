import { StateView } from '@dental/ui';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { isModuleLicensed, moduleForPath } from './license-modules';
import { useLicensedModules } from './use-licensed-modules';

/**
 * FX-127 (LC-05): tarifda (desktop `.lic`) yo'q modul sahifasi URL orqali ochilsa —
 * sahifa so'rovlari 403 MODULE_DISABLED olib «rolingizga yopiq» deb ko'rinmasin,
 * aniq «tarifingizda yo'q» ekrani chiqsin. `path` — route pattern (`/cashier`,
 * `/patients/:id/visits/new`). Cheklov yo'q (bulut, holat yuklanmagan) → o'tkazadi.
 */
export function RequireModule({ path, children }: { path: string; children: ReactNode }) {
  const { t } = useTranslation();
  const modules = useLicensedModules();
  if (isModuleLicensed(moduleForPath(path), modules)) return <>{children}</>;
  return (
    <StateView
      status="forbidden"
      title={t('license.module_disabled.title')}
      description={t('license.module_disabled.message')}
    />
  );
}
