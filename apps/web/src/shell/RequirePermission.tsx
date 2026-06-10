import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth-store.ts';

export function RequirePermission({
  perm,
  children,
}: {
  perm: string | string[];
  children: ReactNode;
}) {
  const { hasPermission } = useAuthStore();
  const perms = Array.isArray(perm) ? perm : [perm];
  const allowed = perms.some((p) => hasPermission(p));
  if (!allowed) return <Navigate to="/403" replace />;
  return <>{children}</>;
}
