import { StateView, StatusPill } from '@dental/ui';
import { Modal } from '@mantine/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, HubApiError } from '@/lib/api';
import { useAuth } from '@/stores/auth';
import { useLabUsers } from '../cases/cases.api';
import { caseKeys } from '../cases/cases.keys';
import type { LabUserDto } from '../cases/cases.types';

type Created = { user: LabUserDto; tempPassword: string };

export function StaffPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const me = useAuth((s) => s.user);
  const list = useLabUsers(true);
  const [adding, setAdding] = useState(false);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<'technician' | 'lead'>('technician');
  const [formError, setFormError] = useState<string | null>(null);
  const [created, setCreated] = useState<Created | null>(null);
  const [copied, setCopied] = useState(false);

  const create = useMutation({
    mutationFn: () =>
      api.post<Created>('/v1/lab/users', { fullName: fullName.trim(), phone, role }),
    onSuccess: (r) => {
      setCreated(r);
      setAdding(false);
      setFullName('');
      setPhone('');
      setRole('technician');
      void qc.invalidateQueries({ queryKey: caseKeys.users });
    },
    onError: (err) =>
      setFormError(
        err instanceof HubApiError && err.code === 'lab_user.phone_taken'
          ? t('labHub.staff.phoneTaken')
          : t('labHub.common.error'),
      ),
  });
  const toggle = useMutation({
    mutationFn: (u: LabUserDto) => api.patch(`/v1/lab/users/${u.id}`, { isActive: !u.isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: caseKeys.users }),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    create.mutate();
  };

  return (
    <>
      <header className="page-head">
        <div className="page-head__title">
          <h1>{t('labHub.staff.title')}</h1>
          <span className="page-head__sub">{t('labHub.staff.subtitle')}</span>
        </div>
        <button type="button" className="btn btn--primary" onClick={() => setAdding(true)}>
          {t('labHub.staff.add')}
        </button>
      </header>
      <div className="page-body">
        {adding && (
          <form className="card" onSubmit={submit} aria-label={t('labHub.staff.formTitle')}>
            <h2>{t('labHub.staff.formTitle')}</h2>
            {formError && (
              <div role="alert" className="form-error">
                {formError}
              </div>
            )}
            <div className="inline-form">
              <div className="field">
                <label htmlFor="st-name">{t('labHub.staff.fullName')}</label>
                <input
                  id="st-name"
                  className="input"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="st-phone">{t('labHub.staff.phone')}</label>
                <input
                  id="st-phone"
                  className="input"
                  type="tel"
                  placeholder="+998 90 123 45 67"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="st-role">{t('labHub.staff.role')}</label>
                <select
                  id="st-role"
                  className="input"
                  value={role}
                  onChange={(e) => setRole(e.target.value as 'technician' | 'lead')}
                >
                  <option value="technician">{t('labHub.staff.roles.technician')}</option>
                  <option value="lead">{t('labHub.staff.roles.lead')}</option>
                </select>
              </div>
            </div>
            <div className="actions">
              <button
                type="submit"
                className="btn btn--primary"
                disabled={
                  create.isPending ||
                  fullName.trim().length < 2 ||
                  phone.replace(/\D/g, '').length < 9
                }
              >
                {t('labHub.common.save')}
              </button>
              <button type="button" className="btn" onClick={() => setAdding(false)}>
                {t('labHub.common.cancel')}
              </button>
            </div>
          </form>
        )}
        <section className="card">
          {list.isLoading && <StateView status="loading" skeleton="table" />}
          {list.isError && (
            <StateView
              status="error"
              title={t('labHub.common.loadError')}
              onRetry={() => void list.refetch()}
              retryLabel={t('labHub.app.retry')}
            />
          )}
          {list.data && list.data.users.length === 0 && (
            <StateView status="empty" title={t('labHub.staff.empty')} />
          )}
          {list.data && list.data.users.length > 0 && (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('labHub.staff.fullName')}</th>
                    <th>{t('labHub.staff.phone')}</th>
                    <th>{t('labHub.staff.role')}</th>
                    <th>{t('labHub.staff.status')}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {list.data.users.map((u) => (
                    <tr key={u.id}>
                      <td>
                        <b>{u.fullName}</b>{' '}
                        {u.id === me?.id && <span className="muted">{t('labHub.staff.you')}</span>}
                      </td>
                      <td className="mono">{u.phone}</td>
                      <td>{t(`labHub.staff.roles.${u.role}`)}</td>
                      <td>
                        <StatusPill status={u.isActive ? 'confirmed' : 'done'}>
                          {u.isActive ? t('labHub.staff.active') : t('labHub.staff.inactive')}
                        </StatusPill>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {u.id !== me?.id && (
                          <button
                            type="button"
                            className="btn btn--sm"
                            disabled={toggle.isPending}
                            onClick={() => toggle.mutate(u)}
                          >
                            {u.isActive ? t('labHub.staff.deactivate') : t('labHub.staff.activate')}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <Modal
        opened={!!created}
        onClose={() => {
          setCreated(null);
          setCopied(false);
        }}
        title={t('labHub.staff.tempTitle')}
        centered
        radius="lg"
        closeOnClickOutside={false}
        transitionProps={{ duration: 0 }}
      >
        {created && (
          <div className="files">
            <b>{created.user.fullName}</b>
            <span className="mono">{created.user.phone}</span>
            <div className="temp-pass" data-testid="temp-password">
              {created.tempPassword}
            </div>
            <span className="muted">{t('labHub.staff.tempNote')}</span>
            <div className="actions" style={{ justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  void navigator.clipboard?.writeText(created.tempPassword);
                  setCopied(true);
                }}
              >
                {copied ? t('labHub.staff.copied') : t('labHub.staff.copy')}
              </button>
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => {
                  setCreated(null);
                  setCopied(false);
                }}
              >
                {t('labHub.common.close')}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
