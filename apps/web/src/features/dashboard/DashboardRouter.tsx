import { useAuthStore } from '@/stores/auth-store.ts';
import { GenericDashboard } from './components/GenericDashboard.tsx';
import { ManagerDashboard } from './components/ManagerDashboard.tsx';
import { DASHBOARD_BY_ROLE } from './role-dashboard-map.ts';

/**
 * Rolga moslashuvchi landing — `@owner` → Menejer; `roleKey` map'da bo'lsa → mos
 * dashboard; aks holda → GenericDashboard (CLI-21).
 */
export function DashboardRouter() {
  const { roleKey, permissions } = useAuthStore();
  if (permissions.includes('@owner')) return <ManagerDashboard />;
  const Cmp = roleKey ? DASHBOARD_BY_ROLE[roleKey] : undefined;
  return Cmp ? <Cmp /> : <GenericDashboard />;
}
