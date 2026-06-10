import {
  ArrowLeftRight,
  BarChart3,
  Building2,
  Calendar,
  Coins,
  FileText,
  FlaskConical,
  Home,
  LineChart,
  ListChecks,
  type LucideIcon,
  Package,
  Pill,
  Receipt,
  ScrollText,
  Settings,
  Shield,
  Stethoscope,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react';

export type NavItem = {
  key: string;
  labelKey: string;
  icon: LucideIcon;
  path: string;
  /** LIVE element — auth hasPermission bilan filtrlanadi. FUTURE element'da bo'lmaydi. */
  permission?: string | string[];
  /** FUTURE element (R3/R4) — hammaga ko'rinadi, bosib bo'lmaydi. */
  disabled?: true;
};
export type NavGroup = { labelKey: string; items: NavItem[] };

export const NAV_GROUPS: NavGroup[] = [
  {
    labelKey: 'nav.group.today',
    items: [
      { key: 'home', labelKey: 'nav.dashboard', icon: Home, path: '/' },
      {
        key: 'appointments',
        labelKey: 'nav.appointments',
        icon: Calendar,
        path: '/appointments',
        permission: 'appointment.view',
      },
      {
        key: 'queue',
        labelKey: 'nav.queue',
        icon: ListChecks,
        path: '/queue',
        permission: 'queue.view',
      },
    ],
  },
  {
    labelKey: 'nav.group.patients',
    items: [
      {
        key: 'patients',
        labelKey: 'nav.patients',
        icon: Users,
        path: '/patients',
        permission: 'patient.view',
      },
      {
        key: 'patient-new',
        labelKey: 'nav.patient_new',
        icon: UserPlus,
        path: '/patients/new',
        permission: 'patient.create',
      },
    ],
  },
  {
    labelKey: 'nav.group.clinic',
    items: [
      { key: 'plans', labelKey: 'nav.plans', icon: FileText, path: '/plans', disabled: true },
      { key: 'lab', labelKey: 'nav.lab', icon: FlaskConical, path: '/lab', disabled: true },
      { key: 'rx', labelKey: 'nav.rx', icon: Pill, path: '/rx', disabled: true },
    ],
  },
  {
    labelKey: 'nav.group.finance',
    items: [
      {
        key: 'cashier',
        labelKey: 'nav.cashier',
        icon: Wallet,
        path: '/cashier',
        permission: 'cashier.view',
      },
      {
        key: 'transactions',
        labelKey: 'nav.transactions',
        icon: ArrowLeftRight,
        path: '/transactions',
        disabled: true,
      },
      {
        key: 'expenses',
        labelKey: 'nav.expenses',
        icon: Receipt,
        path: '/expenses',
        disabled: true,
      },
      { key: 'payroll', labelKey: 'nav.payroll', icon: Coins, path: '/payroll', disabled: true },
    ],
  },
  {
    labelKey: 'nav.group.management',
    items: [
      { key: 'kpi', labelKey: 'nav.kpi', icon: BarChart3, path: '/dashboard', disabled: true },
      {
        key: 'reports',
        labelKey: 'nav.reports',
        icon: LineChart,
        path: '/reports',
        disabled: true,
      },
      {
        key: 'services',
        labelKey: 'nav.services',
        icon: Stethoscope,
        path: '/settings/services',
        permission: 'service.view',
      },
      {
        key: 'branches',
        labelKey: 'nav.branches',
        icon: Building2,
        path: '/settings/branches',
        permission: 'branch.view',
      },
      {
        key: 'roles',
        labelKey: 'nav.roles',
        icon: Shield,
        path: '/settings/roles',
        permission: 'role.view',
      },
      {
        key: 'users',
        labelKey: 'nav.users',
        icon: Users,
        path: '/settings/users',
        permission: 'user.view',
      },
      { key: 'stock', labelKey: 'nav.stock', icon: Package, path: '/stock', disabled: true },
      { key: 'audit', labelKey: 'nav.audit', icon: ScrollText, path: '/audit', disabled: true },
      {
        key: 'settings',
        labelKey: 'nav.tenant_settings',
        icon: Settings,
        path: '/settings/tenant',
        permission: 'tenant.view',
      },
    ],
  },
];

/** Element ko'rinadimi: FUTURE (disabled) → har doim; LIVE → permissionsiz yoki hasPermission. */
function isVisible(item: NavItem, has: (p: string) => boolean): boolean {
  if (item.disabled) return true;
  if (!item.permission) return true;
  const perms = Array.isArray(item.permission) ? item.permission : [item.permission];
  return perms.some((p) => has(p));
}

/** Ruxsat bo'yicha filtrlangan guruhlar; bo'sh guruh tushiriladi. */
export function visibleGroups(has: (p: string) => boolean): NavGroup[] {
  return NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => isVisible(i, has)) })).filter(
    (g) => g.items.length > 0,
  );
}
