import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth-store.ts';

/**
 * Protected route guard.
 * - Token yo'q → /login
 * - Token bor, lekin active workspace yo'q → /select-workspace
 * - Token + workspace → children
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { accessToken, activeTenantId } = useAuthStore();

  if (!accessToken) {
    return <Navigate to="/login" replace />;
  }

  if (!activeTenantId) {
    return <Navigate to="/select-workspace" replace />;
  }

  return <>{children}</>;
}
