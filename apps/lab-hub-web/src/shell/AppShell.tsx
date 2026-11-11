import { AlertBanner } from '@dental/ui';
import { useMantineColorScheme } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { NavLink, Outlet } from 'react-router-dom';
import { LabIcon } from '@/features/auth/AuthLogo';
import { useAllCases } from '@/features/cases/cases.api';
import { useAuth } from '@/stores/auth';

const Icon = ({ d }: { d: string }) => (
  <svg
    aria-hidden="true"
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d={d} />
  </svg>
);

const ICONS = {
  cases: 'M9 3h6M10 3v6L4 19a2 2 0 0 0 1.7 3h12.6a2 2 0 0 0 1.7-3L14 9V3',
  clinics: 'M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6',
  prices: 'M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
  staff:
    'M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M21 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
};

export function AppShell() {
  const { t, i18n } = useTranslation();
  const { user, lab, logout } = useAuth();
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const isLead = user?.role === 'lead';
  const newCount = useAllCases().data?.tabCounts.new;
  const initials = (user?.fullName ?? '?')
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');
  const lng = i18n.language.startsWith('ru') ? 'ru' : 'uz';

  const items = [
    { to: '/', key: 'cases', icon: ICONS.cases, badge: newCount, end: true },
    { to: '/clinics', key: 'clinics', icon: ICONS.clinics },
    { to: '/prices', key: 'prices', icon: ICONS.prices },
    ...(isLead ? [{ to: '/staff', key: 'staff', icon: ICONS.staff }] : []),
  ];

  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        {t('labHub.app.skip')}
      </a>
      <nav className="shell__nav" aria-label={t('labHub.app.mainMenu')}>
        <div className="shell__nav-in">
          <div className="shell__brand">
            <span className="shell__logo">
              <LabIcon />
            </span>
            <div className="shell__brand-text">
              <b>{t('labHub.app.name')}</b>
              <span>{lab?.name}</span>
            </div>
          </div>
          <div>
            <div className="shell__group-title">{t('labHub.nav.labTitle')}</div>
            <div className="shell__links">
              {items.map((i) => (
                <NavLink key={i.to} to={i.to} end={i.end} className="navlink">
                  <Icon d={i.icon} />
                  <span>{t(`labHub.nav.${i.key}`)}</span>
                  {i.badge ? <span className="navlink__badge">{i.badge}</span> : null}
                </NavLink>
              ))}
            </div>
          </div>
          <div className="shell__foot">
            <div className="shell__tools">
              {(['uz', 'ru'] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  className="chip-btn"
                  aria-pressed={lng === l}
                  onClick={() => void i18n.changeLanguage(l)}
                >
                  {l.toUpperCase()}
                </button>
              ))}
              <button
                type="button"
                className="chip-btn"
                aria-pressed={colorScheme === 'dark'}
                aria-label={colorScheme === 'dark' ? t('labHub.app.light') : t('labHub.app.dark')}
                onClick={() => setColorScheme(colorScheme === 'dark' ? 'light' : 'dark')}
              >
                {colorScheme === 'dark' ? '☀' : '☾'}
              </button>
            </div>
            <div className="shell__user">
              <span className="shell__avatar" aria-hidden="true">
                {initials}
              </span>
              <div className="shell__user-meta">
                <b>{user?.fullName}</b>
                <span>{user ? t(`labHub.staff.roles.${user.role}`) : ''}</span>
              </div>
              <button
                type="button"
                className="icon-btn"
                aria-label={t('labHub.app.logout')}
                onClick={logout}
              >
                <Icon d={ICONS.logout} />
              </button>
            </div>
          </div>
        </div>
      </nav>
      <main className="shell__main" id="main">
        {lab?.subscription === 'grace' && (
          <div className="shell__banners">
            <AlertBanner tier={2} title={t('labHub.subscription.graceTitle')}>
              {t('labHub.subscription.graceText')}
            </AlertBanner>
          </div>
        )}
        <Outlet />
      </main>
    </div>
  );
}
