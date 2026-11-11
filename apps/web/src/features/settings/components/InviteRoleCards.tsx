import { VisuallyHidden } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { roleLabel, roleTemplateKey } from '@/lib/role-label';
import type { GrantableRole } from '../settings.api';

/** Kanvasdagi (Staff) qisqa «qila oladi / qila olmaydi» matnlari bor tizim shablonlari. */
const DESCRIBED = new Set([
  'tenant_admin',
  'branch_manager',
  'doctor',
  'doctor_assistant',
  'nurse',
  'receptionist',
  'accountant',
  'technician',
]);

/**
 * «Xodim taklif qilish» paneli: rol tanlash kartalari (radio). Faqat chaqiruvchi bera oladigan
 * rollar keladi (server `grantable-roles` — P5), shuning uchun yuqori huquqli rol ko'rinmaydi.
 */
export function InviteRoleCards({
  roles,
  value,
  onChange,
  error,
}: {
  roles: GrantableRole[];
  value: string;
  onChange: (id: string) => void;
  error?: string;
}) {
  const { t } = useTranslation();
  return (
    <div>
      <div id="invite-role-label" style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
        {t('users.role')} <span style={{ color: 'var(--danger)' }}>*</span>
      </div>
      <div
        role="radiogroup"
        aria-labelledby="invite-role-label"
        style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
      >
        {roles.map((r) => {
          const key = roleTemplateKey(r.name, r.isSystem);
          const described = key !== null && DESCRIBED.has(key);
          const selected = value === r.id;
          return (
            // biome-ignore lint/a11y/useSemanticElements: radio-karta (ichida matn bloklari bor) — tugma + role=radio
            <button
              key={r.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(r.id)}
              style={{
                textAlign: 'left',
                padding: '10px 12px',
                minHeight: 'var(--tap-min)',
                borderRadius: 10,
                cursor: 'pointer',
                color: 'var(--ink)',
                background: selected ? 'var(--primary-soft)' : 'var(--surface)',
                border: selected ? '2px solid var(--primary)' : '1px solid var(--border-strong)',
              }}
            >
              <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontWeight: 700 }}>{roleLabel(r.name, t, r.isSystem)}</span>
                <span style={{ color: 'var(--ink-3)', fontSize: 12 }}>
                  {described ? t(`staffPanel.scope_${key}`) : t('staffPanel.scope_custom')}
                </span>
              </span>
              {described && (
                <>
                  <span style={{ display: 'block', color: 'var(--success)', fontSize: 12.5 }}>
                    <span aria-hidden="true">✓ </span>
                    <VisuallyHidden>{t('staffCards.can')}: </VisuallyHidden>
                    {t(`staffPanel.can_${key}`)}
                  </span>
                  <span style={{ display: 'block', color: 'var(--danger)', fontSize: 12.5 }}>
                    <span aria-hidden="true">✕ </span>
                    <VisuallyHidden>{t('staffCards.cannot')}: </VisuallyHidden>
                    {t(`staffPanel.cannot_${key}`)}
                  </span>
                </>
              )}
            </button>
          );
        })}
      </div>
      {error && (
        <div role="alert" style={{ color: 'var(--danger)', fontSize: 12, marginTop: 4 }}>
          {error}
        </div>
      )}
      <div style={{ color: 'var(--ink-3)', fontSize: 12, marginTop: 6 }}>
        {t('staffPanel.grant_note')}
      </div>
    </div>
  );
}
