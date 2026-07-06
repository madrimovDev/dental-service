import type { PermissionDef } from '@dental/api-client';
import { useTranslation } from 'react-i18next';
import { groupPermissionsByResource } from '../settings.mappers';

/**
 * Pill-toggle ruxsat grid'i (DS10 re-skin). Checkbox o'rniga 38×22 toggle.
 * Signature O'ZGARMAYDI — `{ permissions, selected:Set<string>, onChange }`.
 * Toggle = bir xil `Set<string>`'ning re-presentatsiyasi (xulq saqlanadi).
 */
export function PermissionBuilder({
  permissions,
  selected,
  onChange,
}: {
  permissions: PermissionDef[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const { t, i18n } = useTranslation();
  const groups = groupPermissionsByResource(permissions);

  const toggleOne = (code: string, checked: boolean) => {
    const next = new Set(selected);
    if (checked) next.add(code);
    else next.delete(code);
    onChange(next);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {groups.map((group) => {
        const label = t(`settings.perm_group.${group.resource}`, group.resource);
        return (
          <div key={group.resource}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                color: 'var(--ink-3)',
                marginBottom: 2,
              }}
            >
              {label}
            </div>
            {group.permissions.map((p) => {
              const desc = i18n.language === 'ru' ? p.descriptionRu : p.descriptionUz;
              const permLabel = desc || p.code;
              const on = selected.has(p.code);
              return (
                <div
                  key={p.code}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    padding: '9px 0',
                    borderTop: '1px solid var(--border)',
                  }}
                >
                  <span style={{ fontSize: 13, color: 'var(--ink)' }}>{permLabel}</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={on}
                    aria-label={permLabel}
                    onClick={() => toggleOne(p.code, !on)}
                    style={{
                      flexShrink: 0,
                      position: 'relative',
                      width: 38,
                      height: 22,
                      padding: 0,
                      border: on ? 'none' : '1px solid var(--border)',
                      borderRadius: 11,
                      cursor: 'pointer',
                      background: on ? 'var(--primary)' : 'var(--surface-2)',
                      transition: 'background 0.15s ease',
                    }}
                  >
                    <span
                      style={{
                        position: 'absolute',
                        top: 2,
                        left: on ? 18 : 2,
                        width: 18,
                        height: 18,
                        borderRadius: '50%',
                        background: on ? 'var(--on-primary)' : 'var(--ink-3)',
                        transition: 'left 0.15s ease',
                      }}
                    />
                  </button>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
