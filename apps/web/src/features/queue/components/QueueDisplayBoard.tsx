import type { QueueTicket } from '@dental/api-client';
import { Button } from '@mantine/core';
import { IconLogout } from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth-store.ts';
import { useBranches, useQueueToday } from '../queue.api';
import classes from './QueueDisplayBoard.module.css';

/** Presentation formatter — schema/API o'zgarmaydi (DS5 spec §3.4). */
function formatTicketNumber(queueNumber: number): string {
  return `A-${String(queueNumber).padStart(2, '0')}`;
}

function hhmmss(d: Date): string {
  return d.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/** FX-158: shu muddatdan eski ma'lumot TV'da «eskirgan» deb belgilanadi (poll 10 s). */
const STALE_AFTER_MS = 30_000;

/** Jonli soat — setInterval(1000), unmount'da clearInterval (cleanup). */
function useClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export function QueueDisplayBoard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { activeBranchId } = useAuthStore();

  const branches = useBranches();
  const queue = useQueueToday(activeBranchId);
  const now = useClock();
  const clock = hhmmss(now);
  // FX-158: xato yoki uzoq vaqt yangilanmagan ma'lumot — eskirgan raqamlarni jonli ko'rsatmaymiz.
  const stale =
    queue.isError ||
    (queue.dataUpdatedAt > 0 && now.getTime() - queue.dataUpdatedAt > STALE_AFTER_MS);

  // PII: TV ekranida bemor ismi/xizmati CHIQMAYDI — faqat navbat raqami.
  const tickets = queue.data ?? [];

  // Chaqirilganlar: barcha in_progress ticketlar (navbat raqami bo'yicha barqaror tartib).
  const inProgress = useMemo(
    () =>
      tickets
        .filter((tk: QueueTicket) => tk.status === 'in_progress')
        .sort((a: QueueTicket, b: QueueTicket) => a.queueNumber - b.queueNumber),
    [tickets],
  );
  // "Keyingi navbatlar" manbasi: birinchi 3 waiting ticket.
  const nextWaiting = useMemo(
    () => tickets.filter((tk: QueueTicket) => tk.status === 'waiting').slice(0, 3),
    [tickets],
  );

  const branchName = branches.data?.find((b) => b.id === activeBranchId)?.name ?? '';

  // FX-125: «Kabinet N» yorlig'i slot-indeksga bog'liq edi (raqamlar sakrardi, 3-bemor ko'rinmasdi) —
  // endi barcha chaqirilganlar cheklovsiz, navbat raqami bo'yicha barqaror ro'yxat.
  const renderCalled = (ticket: QueueTicket | undefined, key: string) => (
    <div key={key} className={`${classes.cabinet} ${classes.cabinetPrimary}`}>
      <span className={classes.cabinetEyebrow}>{t('queue.called')}</span>
      <span className={classes.cabinetNumber}>
        {ticket ? formatTicketNumber(ticket.queueNumber) : '—'}
      </span>
      {!ticket && <span className={classes.cabinetPlaceholder}>{t('queue.not_called_yet')}</span>}
    </div>
  );

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

      {stale && (
        <div role="alert" className={classes.staleBanner}>
          {t('queueBoard.stale_banner')}
        </div>
      )}

      <div className={`${classes.cabinets} ${stale ? classes.stale : ''}`}>
        {inProgress.length > 0
          ? inProgress.map((tk: QueueTicket) => renderCalled(tk, tk.id))
          : renderCalled(undefined, 'empty')}
      </div>

      <section className={`${classes.nextPanel} ${stale ? classes.stale : ''}`}>
        <h2 className={classes.nextTitle}>{t('queue.next_queues')}</h2>
        <p className={classes.nextEmpty}>{t('queueBoard.tv_numbers_only')}</p>
        {nextWaiting.length > 0 ? (
          <div className={classes.nextCards}>
            {nextWaiting.map((tk: QueueTicket, i) => (
              <div key={tk.id} className={classes.nextCard}>
                <span className={`${classes.nextNumber} ${i === 0 ? classes.nextNumberLead : ''}`}>
                  {formatTicketNumber(tk.queueNumber)}
                </span>
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
