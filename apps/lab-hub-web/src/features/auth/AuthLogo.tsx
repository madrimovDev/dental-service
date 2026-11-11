import { useTranslation } from 'react-i18next';

export function LabIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 3h6M10 3v6L4 19a2 2 0 0 0 1.7 3h12.6a2 2 0 0 0 1.7-3L14 9V3" />
    </svg>
  );
}

export function AuthLogo() {
  const { t } = useTranslation();
  return (
    <div className="shell__brand" style={{ padding: 0 }}>
      <span className="shell__logo">
        <LabIcon />
      </span>
      <div className="shell__brand-text">
        <b>{t('labHub.app.name')}</b>
      </div>
    </div>
  );
}
