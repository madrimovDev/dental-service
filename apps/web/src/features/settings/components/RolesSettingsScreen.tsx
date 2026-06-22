import type { Role } from '@dental/api-client';
import { StatusPill, Tag } from '@dental/ui';
import { ActionIcon, Button } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/auth-store.ts';
import {
  useDeleteRole,
  usePermissions,
  useRole,
  useRoles,
  useUpsertRole,
  useUsers,
} from '../settings.api';
import { ConfirmModal } from './ConfirmModal';
import { PermissionBuilder } from './PermissionBuilder';
import { RoleFormModal } from './RoleFormModal';
import { SettingsShell } from './SettingsShell';

export function RolesSettingsScreen() {
  const { t } = useTranslation();
  const { hasPermission } = useAuthStore();
  const roles = useRoles();
  const permissions = usePermissions();
  const users = useUsers();
  const upsert = useUpsertRole();
  const deleteRole = useDeleteRole();

  const [opened, { open, close }] = useDisclosure(false);
  const [editing, setEditing] = useState<Role | null>(null);
  const [toDelete, setToDelete] = useState<Role | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedPerms, setSelectedPerms] = useState<Set<string>>(new Set());

  const roleList = roles.data ?? [];
  const selectedRole = roleList.find((r) => r.id === selectedId) ?? roleList[0] ?? null;

  // Birinchi rolni default tanlash
  // biome-ignore lint/correctness/useExhaustiveDependencies: faqat ro'yxat o'zgarganda
  useEffect(() => {
    const first = roleList[0];
    if (!selectedId && first) setSelectedId(first.id);
  }, [roleList.length]);

  const detail = useRole(selectedRole?.id ?? null, !!selectedRole);

  // Tanlangan rol ruxsatlarini lokal Set'ga yuklash
  // biome-ignore lint/correctness/useExhaustiveDependencies: detail/selectedRole o'zgarganda
  useEffect(() => {
    setSelectedPerms(new Set(detail.data?.permissions ?? []));
  }, [detail.data, selectedRole?.id]);

  const userCountByRole = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of users.data ?? []) {
      map.set(a.roleId, (map.get(a.roleId) ?? 0) + 1);
    }
    return map;
  }, [users.data]);

  const openCreate = () => {
    setEditing(null);
    open();
  };

  const handleSave = () => {
    if (!selectedRole) return;
    upsert.mutate({
      id: selectedRole.id,
      name: selectedRole.name,
      description: selectedRole.description ?? undefined,
      permissions: [...selectedPerms],
    });
  };

  const canManage = hasPermission('role.manage');

  return (
    <SettingsShell active="roles">
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '266px minmax(0, 1fr)',
          gap: 16,
          alignItems: 'start',
        }}
      >
        {/* Chap panel — rol ro'yxati */}
        <div
          style={{
            borderRadius: 16,
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 18px',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>
              {t('settings.nav_roles')}
            </span>
            {canManage && (
              <ActionIcon
                onClick={openCreate}
                aria-label={t('roles.create')}
                variant="subtle"
                style={{ width: 28, height: 28 }}
              >
                <IconPlus size={16} />
              </ActionIcon>
            )}
          </div>
          <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {roleList.map((r) => {
              const active = r.id === selectedRole?.id;
              const count = userCountByRole.get(r.id) ?? 0;
              return (
                <button
                  type="button"
                  key={r.id}
                  onClick={() => setSelectedId(r.id)}
                  style={{
                    textAlign: 'left',
                    cursor: 'pointer',
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: active ? '1px solid var(--primary)' : '1px solid transparent',
                    background: active ? 'var(--primary-soft)' : 'transparent',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                  }}
                >
                  <span
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 13.5,
                        fontWeight: active ? 700 : 600,
                        color: active ? 'var(--primary)' : 'var(--ink)',
                      }}
                    >
                      {r.name}
                    </span>
                    <Tag>{r.isSystem ? t('roles.system') : t('roles.custom')}</Tag>
                  </span>
                  {r.description && (
                    <span style={{ fontSize: 11, color: 'var(--ink-2)' }}>{r.description}</span>
                  )}
                  {users.data && (
                    <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>
                      {t('settings.role_users', { count })}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* O'ng panel — ruxsat grid */}
        <div
          style={{
            borderRadius: 16,
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          {selectedRole ? (
            <>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: '16px 18px',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      fontSize: 16,
                      fontWeight: 700,
                      color: 'var(--ink)',
                    }}
                  >
                    {selectedRole.name}
                    {selectedRole.isSystem && (
                      <StatusPill status="neutral" dot={false}>
                        {t('roles.system_template')}
                      </StatusPill>
                    )}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                    {t('settings.role_perm_count', { count: selectedPerms.size })}
                  </span>
                </div>
                {canManage && (
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <Button variant="outline" size="xs" onClick={() => setEditing(selectedRole)}>
                      {t('common.edit')}
                    </Button>
                    {!selectedRole.isSystem && (
                      <ActionIcon
                        variant="subtle"
                        color="red"
                        onClick={() => setToDelete(selectedRole)}
                        aria-label={t('common.delete')}
                      >
                        <IconTrash size={16} />
                      </ActionIcon>
                    )}
                    <Button
                      size="xs"
                      onClick={handleSave}
                      loading={upsert.isPending}
                      styles={{
                        root: { background: 'var(--primary)', color: 'var(--on-primary)' },
                      }}
                    >
                      {t('common.save')}
                    </Button>
                  </div>
                )}
              </div>
              <div style={{ padding: '6px 18px 18px' }}>
                <PermissionBuilder
                  permissions={permissions.data ?? []}
                  selected={selectedPerms}
                  onChange={setSelectedPerms}
                />
              </div>
            </>
          ) : null}
        </div>
      </div>

      <RoleFormModal
        opened={opened || !!editing}
        onClose={() => {
          close();
          setEditing(null);
        }}
        editing={editing}
      />

      <ConfirmModal
        opened={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={() => {
          if (toDelete) deleteRole.mutate(toDelete.id, { onSuccess: () => setToDelete(null) });
        }}
        message={t('roles.confirm_delete')}
        loading={deleteRole.isPending}
      />
    </SettingsShell>
  );
}
