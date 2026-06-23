import type { QueueTicket } from '@dental/api-client';
import { Avatar } from '@dental/ui';
import { Button } from '@mantine/core';
import { IconLogout } from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth-store.ts';
import { useBranches, usePatientsAll, useQueueToday, useServices } from '../queue.api';
import classes from './QueueDisplayBoard.module.css';

/** Presentation formatter — schema/API o'zgarmaydi (DS5 spec §3.4). */
function formatTicketNumber(queueNumber: number): string {
  return `A-${String(queueNumber).padStart(2, '0')}`;
}

function hhmmss(d: Date): string {
  return d.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/** Jonli soat — setInterval(1000), unmount'da clearInterval (cleanup). */
function useClock(): string {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return hhmmss(now);
}

type Slot = {
  ticket: QueueTicket | undefined;
  patientName: string;
  serviceName: string | null;
};

export function QueueDisplayBoard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { activeBranchId } = useAuthStore();

  const branches = useBranches();
  const patients = usePatientsAll();
  const services = useServices();
  const queue = useQueueToday(activeBranchId);
  const clock = useClock();

  const patientNameById = useMemo(
    () => new Map((patients.data?.data ?? []).map((p) => [p.id, p.fullName] as const)),
    [patients.data],
  );
  const serviceNameById = useMemo(
    () => new Map((services.data ?? []).map((s) => [s.id, s.nameUz] as const)),
    [services.data],
  );

  const patientName = (id: string | null) => (id ? (patientNameById.get(id) ?? '—') : '—');
  const serviceName = (id: string | null) => (id ? (serviceNameById.get(id) ?? null) : null);

  const tickets = queue.data ?? [];

  // Cabinet showcase manbasi: in_progress ticketlar (≤2), fixed 2 slot.
  const inProgress = useMemo(
    () => tickets.filter((tk: QueueTicket) => tk.status === 'in_progress'),
    [tickets],
  );
  // "Keyingi navbatlar" manbasi: birinchi 3 waiting ticket.
  const nextWaiting = useMemo(
    () => tickets.filter((tk: QueueTicket) => tk.status === 'waiting').slice(0, 3),
    [tickets],
  );

  const branchName = branches.data?.find((b) => b.id === activeBranchId)?.name ?? '';

  const slotOf = (idx: 0 | 1): Slot => {
    const ticket = inProgress[idx];
    return {
      ticket,
      patientName: ticket ? patientName(ticket.patientId) : '—',
      serviceName: ticket ? serviceName(ticket.serviceId) : null,
    };
  };

  const renderCabinet = (idx: 0 | 1, variant: string | undefined) => {
    const slot = slotOf(idx);
    return (
      <div className={`${classes.cabinet} ${variant}`}>
        <span className={classes.cabinetEyebrow}>{t('queue.cabinet', { n: idx + 1 })}</span>
        <span className={classes.cabinetNumber}>
          {slot.ticket ? formatTicketNumber(slot.ticket.queueNumber) : '—'}
        </span>
        {slot.ticket ? (
          <div className={classes.cabinetMeta}>
            <span className={classes.cabinetPatient}>{slot.patientName}</span>
            {slot.serviceName && <span className={classes.cabinetService}>{slot.serviceName}</span>}
          </div>
        ) : (
          <span className={classes.cabinetPlaceholder}>{t('queue.not_called_yet')}</span>
        )}
      </div>
    );
  };

  return (
    <div className={classes.root}>
      <header className={classes.header}>
        <div className={classes.brand}>
          <span className={classes.logo}>DD</span>
          <div className={classes.brandText}>
            <span className={classes.clinicName}>{branchName || t('queue.title')}</span>
            <span className={classes.subtitle}>
              {[t('queue.board_subtitle'), branchName].filter(Boolean).join(' · ')}
            </span>
          </div>
        </div>
        <div className={classes.headerRight}>
          <span className={classes.clock}>
            <span className={classes.clockDot} />
            {clock}
          </span>
          <Button
            variant="default"
            className={classes.exitButton}
            leftSection={<IconLogout size={18} />}
            onClick={() => navigate('/queue')}
          >
            {t('queue.exit')}
          </Button>
        </div>
      </header>

      <div className={classes.cabinets}>
        {renderCabinet(0, classes.cabinetPrimary)}
        {renderCabinet(1, classes.cabinetViolet)}
      </div>

      <section className={classes.nextPanel}>
        <h2 className={classes.nextTitle}>{t('queue.next_queues')}</h2>
        {nextWaiting.length > 0 ? (
          <div className={classes.nextCards}>
            {nextWaiting.map((tk: QueueTicket, i) => (
              <div key={tk.id} className={classes.nextCard}>
                <span className={`${classes.nextNumber} ${i === 0 ? classes.nextNumberLead : ''}`}>
                  {formatTicketNumber(tk.queueNumber)}
                </span>
                <div className={classes.nextCardMeta}>
                  <div className={classes.nextNameRow}>
                    <Avatar name={patientName(tk.patientId)} size="sm" />
                    <span className={classes.nextName}>{patientName(tk.patientId)}</span>
                  </div>
                  {serviceName(tk.serviceId) && (
                    <span className={classes.nextService}>{serviceName(tk.serviceId)}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <span className={classes.nextEmpty}>{t('queue.not_called_yet')}</span>
        )}
      </section>
    </div>
  );
}
