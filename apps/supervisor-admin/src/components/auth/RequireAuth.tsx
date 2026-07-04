import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';

/**
 * Render-time auth guard.
 * - admin_token yo'q (localStorage) → /login
 * - admin_token bor → children
 *
 * apps/web/src/components/auth/ProtectedRoute.tsx bilan bir xil shakl,
 * lekin supervisor-admin'da tenant/permission tushunchasi yo'q — faqat
 * bitta token borligi tekshiriladi (CLI-392).
 */
export const RequireAuth = ({ children }: { children: ReactNode }) => {
  const token = localStorage.getItem('admin_token');

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};
