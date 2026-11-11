import { StateView } from '@dental/ui';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/stores/auth';

/** Token yo'q -> /login; vaqtinchalik parol -> /change-password; obuna tugagan -> /expired. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { token, mustChangePassword, lab } = useAuth();
  const loc = useLocation();
  if (!token) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  if (mustChangePassword) return <Navigate to="/change-password" replace />;
  if (lab?.subscription === 'expired') return <Navigate to="/expired" replace />;
  return <>{children}</>;
}

/** Faqat laboratoriya rahbari (lead) uchun bo'lim. */
export function RequireLead({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const role = useAuth((s) => s.user?.role);
  if (role !== 'lead') {
    return (
      <div className="page-body">
        <StateView status="forbidden" title={t('labHub.common.forbidden')} />
      </div>
    );
  }
  return <>{children}</>;
}
