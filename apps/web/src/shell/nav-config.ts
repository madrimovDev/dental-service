import { hasFeature, type Vertical, type VerticalFeature } from '@dental/core';
import {
  ArrowLeftRight,
  BarChart3,
  Building2,
  Calendar,
  CalendarClock,
  Coins,
  FileText,
  FlaskConical,
  Home,
  LineChart,
  ListChecks,
  type LucideIcon,
  Package,
  PhoneCall,
  Pill,
  Receipt,
  ScrollText,
  Settings,
  Shield,
  Stethoscope,
  Tag,
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
  /** Vertical feature gate — tenant vertical bu feature'ni yoqmasa, element butunlay tushadi. */
  feature?: VerticalFeature;
  /** FUTURE element (R3/R4) — hammaga ko'rinadi, bosib bo'lmaydi. */
  disabled?: true;
};
export type NavGroup = { labelKey: string; items: NavItem[] };

export const NAV_GROUPS: NavGroup[] = [
  {
    labelKey: 'nav.group.asosiy',
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
      {
        key: 'patients',
        labelKey: 'nav.patients',
        icon: Users,
        path: '/patients',
        permission: 'patient.view',
      },
      {
        key: 'cashier',
        labelKey: 'nav.cashier',
        icon: Wallet,
        path: '/cashier',
        permission: 'cashier.view',
      },
    ],
  },
  {
    labelKey: 'nav.group.klinika',
    items: [
      {
        key: 'plans',
        labelKey: 'nav.plans',
        icon: FileText,
        path: '/plans',
        permission: 'medical_record.view',
      },
      {
        key: 'lab',
        labelKey: 'nav.lab',
        icon: FlaskConical,
        path: '/lab',
        feature: 'labOrders',
        permission: 'lab_order.view',
      },
      { key: 'rx', labelKey: 'nav.rx', icon: Pill, path: '/rx', permission: 'medical_record.view' },
      {
        key: 'schedule',
        labelKey: 'nav.schedule',
        icon: CalendarClock,
        path: '/schedule',
        permission: 'schedule.view',
      },
      {
        key: 'recalls',
        labelKey: 'nav.recalls',
        icon: PhoneCall,
        path: '/recalls',
        permission: 'recall.view',
      },
    ],
  },
  {
    labelKey: 'nav.group.boshqaruv',
    items: [
      {
        key: 'reports',
        labelKey: 'nav.reports',
        icon: LineChart,
        path: '/reports',
        permission: 'report.view',
      },
      {
        key: 'services',
        labelKey: 'nav.services',
        icon: Stethoscope,
        path: '/settings/services',
        permission: 'service.view',
      },
      {
        key: 'service-categories',
        labelKey: 'nav.service_categories',
        icon: Tag,
        path: '/settings/service-categories',
        permission: 'service.view',
      },
      {
        key: 'users',
        labelKey: 'nav.users',
        icon: Users,
        path: '/settings/users',
        permission: 'user.view',
      },
      {
        key: 'stock',
        labelKey: 'nav.stock',
        icon: Package,
        path: '/stock',
        permission: 'stock.view',
      },
      {
        key: 'expenses',
        labelKey: 'nav.expenses',
        icon: Receipt,
        path: '/expenses',
        permission: 'expense.view',
      },
      {
        key: 'payroll',
        labelKey: 'nav.payroll',
        icon: Coins,
        path: '/payroll',
        permission: 'payroll.view',
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
        key: 'audit',
        labelKey: 'nav.audit',
        icon: ScrollText,
        path: '/audit',
        permission: 'audit_log.view',
      },
      {
        key: 'settings',
        labelKey: 'nav.tenant_settings',
        icon: Settings,
        path: '/settings/tenant',
        permission: 'tenant.view',
      },
      { key: 'kpi', labelKey: 'nav.kpi', icon: BarChart3, path: '/dashboard' },
      {
        key: 'transactions',
        labelKey: 'nav.transactions',
        icon: ArrowLeftRight,
        path: '/transactions',
        permission: 'cashier.view',
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
];

/**
 * Element ko'rinadimi: vertical feature yoqmasa → tushadi (disabled bo'lsa ham);
 * FUTURE (disabled) → faqat owner (hali realizatsiya qilinmagan, boshqa rollarda
 * butunlay yashiriladi); LIVE → permissionsiz yoki hasPermission.
 */
/**
 * Bitta element ko'rinadimi. Eksport qilingan — FUTURE (disabled) qoidasi qaysi
 * element hozir qulfdan chiqarilganidan qat'i nazar test bilan qulflanadi
 * (CLI-161; `4ce4b07` barcha FUTURE elementlarni LIVE qilgach real element
 * ustidagi test eskirib qolgan edi).
 */
export function isVisible(
  item: NavItem,
  has: (p: string) => boolean,
  vertical: Vertical,
  isOwner: boolean,
): boolean {
  if (item.feature && !hasFeature(vertical, item.feature)) return false;
  if (item.disabled) return isOwner;
  if (!item.permission) return true;
  const perms = Array.isArray(item.permission) ? item.permission : [item.permission];
  return perms.some((p) => has(p));
}

/**
 * Ruxsat + vertical bo'yicha filtrlangan guruhlar; bo'sh guruh tushiriladi.
 * `isOwner` — FUTURE (disabled) elementlar faqat owner uchun ko'rsatiladi.
 */
/** nav-config'da bo'lmagan, lekin Topbar sarlavhasiga muhtoj yo'llar (sidebar'ga qo'shilmaydi). */
export const EXTRA_TITLE_KEYS: Record<string, string> = {
  '/settings/notify': 'settings.nav_notify',
  '/settings/integrations': 'settings.nav_integrations',
  '/profile': 'profile.title',
};

export function visibleGroups(
  has: (p: string) => boolean,
  vertical: Vertical = 'dental',
  isOwner = false,
): NavGroup[] {
  return NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => isVisible(i, has, vertical, isOwner)),
  })).filter((g) => g.items.length > 0);
}

// ---------------------------------------------------------------------------
// Rolga moslashuvchi menyu (UI-0 1.5)
// ---------------------------------------------------------------------------

/** Menyu maketi — `roleKey` (roles.template_key) yoki owner'dan aniqlanadi. */
export type RoleLayoutKind = 'registrator' | 'shifokor' | 'rahbar' | 'texnik';

/** templateKey → maket. Ro'yxatda yo'q (accountant, custom rol, no-context) → permission-filter fallback. */
const LAYOUT_BY_ROLE_KEY: Record<string, RoleLayoutKind> = {
  receptionist: 'registrator',
  doctor: 'shifokor',
  doctor_assistant: 'shifokor',
  nurse: 'shifokor',
  tenant_admin: 'rahbar',
  branch_manager: 'rahbar',
  technician: 'texnik',
};

export function layoutForRole(roleKey: string | null, isOwner: boolean): RoleLayoutKind | null {
  if (isOwner) return 'rahbar';
  return roleKey ? (LAYOUT_BY_ROLE_KEY[roleKey] ?? null) : null;
}

/** Maket bandi — katalog (`NAV_GROUPS`) elementiga havola, ixtiyoriy qisqa yorliq bilan. */
type LayoutEntry = { key: string; labelKey?: string };
type LayoutGroup = { labelKey: string; entries: LayoutEntry[] };
type RoleLayout = { groups: LayoutGroup[]; footer: LayoutEntry[] };

export const ROLE_LAYOUTS: Record<RoleLayoutKind, RoleLayout> = {
  registrator: {
    groups: [
      {
        labelKey: 'nav.role_group.today',
        entries: [
          { key: 'home', labelKey: 'nav.role.today' },
          { key: 'appointments' },
          { key: 'queue', labelKey: 'nav.role.queue' },
        ],
      },
      {
        labelKey: 'nav.role_group.patients_money',
        entries: [
          { key: 'patients', labelKey: 'nav.role.patients' },
          { key: 'cashier' },
          { key: 'recalls', labelKey: 'nav.role.recalls' },
        ],
      },
    ],
    footer: [],
  },
  shifokor: {
    groups: [
      {
        labelKey: 'nav.role_group.today',
        entries: [
          { key: 'home', labelKey: 'nav.role.my_day' },
          { key: 'queue', labelKey: 'nav.role.queue' },
        ],
      },
      {
        labelKey: 'nav.role_group.treatment',
        entries: [
          { key: 'patients', labelKey: 'nav.role.patients' },
          { key: 'plans' },
          { key: 'lab', labelKey: 'nav.role.lab' },
        ],
      },
    ],
    footer: [],
  },
  rahbar: {
    groups: [
      {
        labelKey: 'nav.role_group.general',
        entries: [
          { key: 'home', labelKey: 'nav.role.today' },
          { key: 'appointments' },
          { key: 'patients', labelKey: 'nav.role.patients' },
          { key: 'cashier' },
        ],
      },
      {
        labelKey: 'nav.group.boshqaruv',
        entries: [
          { key: 'reports' },
          { key: 'stock' },
          { key: 'users', labelKey: 'nav.role.staff' },
          { key: 'expenses' },
          { key: 'payroll' },
        ],
      },
    ],
    // Sozlamalar faqat rahbarda — menyu pastida
    footer: [{ key: 'settings' }],
  },
  texnik: {
    groups: [
      {
        labelKey: 'nav.role_group.laboratory',
        entries: [{ key: 'lab', labelKey: 'nav.role.lab_orders' }],
      },
    ],
    footer: [],
  },
};

const CATALOGUE: Map<string, NavItem> = new Map(
  NAV_GROUPS.flatMap((g) => g.items).map((i) => [i.key, i]),
);

function resolveEntries(
  entries: LayoutEntry[],
  has: (p: string) => boolean,
  vertical: Vertical,
  isOwner: boolean,
): NavItem[] {
  const out: NavItem[] = [];
  for (const e of entries) {
    const base = CATALOGUE.get(e.key);
    if (!base || !isVisible(base, has, vertical, isOwner)) continue;
    out.push(e.labelKey ? { ...base, labelKey: e.labelKey } : base);
  }
  return out;
}

export type SidebarModel = {
  /** Asosiy guruhlar (bo'sh guruh tushirilgan). */
  groups: NavGroup[];
  /** Menyu pastidagi elementlar (rahbar: Sozlamalar). */
  footer: NavItem[];
  layout: RoleLayoutKind | null;
};

/**
 * Sidebar modeli. Maket rolga bog'liq, lekin har band baribir permission/vertical bilan
 * filtrlanadi. Maket yo'q (custom rol, accountant, no-context) yoki maketdan hech narsa
 * qolmasa → mavjud 3-guruh permission-filter (menyu hech qachon bo'sh qolmaydi).
 */
export function sidebarModel(input: {
  roleKey: string | null;
  has: (p: string) => boolean;
  vertical?: Vertical;
  isOwner?: boolean;
}): SidebarModel {
  const { roleKey, has, vertical = 'dental', isOwner = false } = input;
  const layout = layoutForRole(roleKey, isOwner);
  if (layout) {
    const def = ROLE_LAYOUTS[layout];
    const groups = def.groups
      .map((g) => ({
        labelKey: g.labelKey,
        items: resolveEntries(g.entries, has, vertical, isOwner),
      }))
      .filter((g) => g.items.length > 0);
    if (groups.length > 0) {
      return { groups, footer: resolveEntries(def.footer, has, vertical, isOwner), layout };
    }
  }
  return { groups: visibleGroups(has, vertical, isOwner), footer: [], layout: null };
}

/**
 * ⌘K uchun: rolga qaramasdan BARCHA ruxsatli sahifalar (katalog superseti). Menyuda
 * ko'rinmaydigan ruxsatli sahifa (masalan registratorda Sozlamalar) shu yerdan topiladi.
 */
export function paletteNavItems(
  has: (p: string) => boolean,
  vertical: Vertical = 'dental',
  isOwner = false,
): NavItem[] {
  return visibleGroups(has, vertical, isOwner)
    .flatMap((g) => g.items)
    .filter((i) => !i.disabled);
}
