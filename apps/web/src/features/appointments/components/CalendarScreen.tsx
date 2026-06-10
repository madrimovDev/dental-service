import { Button, PageHead, Tabs } from '@dental/ui';
import { Modal } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/auth-store.ts';
import { useAppointments, useDoctors } from '../appointments.api';
import { localDateKey } from '../appointments.mappers';
import { CalendarGrid } from './CalendarGrid';
import { NewAppointmentWizard } from './NewAppointmentWizard';
import { WeekGrid } from './WeekGrid';

/** Haftaboshi (dushanba) — local. */
function startOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = (day + 6) % 7; // dushanba = 0
  d.setDate(d.getDate() - diff);
  return d;
}

export function CalendarScreen() {
  const { t } = useTranslation();
  const { hasPermission, activeBranchId } = useAuthStore();
  const [view, setView] = useState<'day' | 'week'>('day');
  const [date, setDate] = useState(() => new Date());
  const [opened, { open, close }] = useDisclosure(false);

  const { rangeStart, rangeEnd, dayKeys } = useMemo(() => {
    if (view === 'week') {
      const start = startOfWeek(date);
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      const keys = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        return localDateKey(d.toISOString());
      });
      return { rangeStart: start, rangeEnd: end, dayKeys: keys };
    }
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { rangeStart: start, rangeEnd: end, dayKeys: [localDateKey(start.toISOString())] };
  }, [view, date]);

  const { data: appts } = useAppointments({
    branchId: activeBranchId ?? undefined,
    from: rangeStart.toISOString(),
    to: rangeEnd.toISOString(),
  });
  const { data: doctors } = useDoctors();

  const shift = (delta: number) => {
    setDate((prev) => {
      const next = new Date(prev);
      next.setDate(next.getDate() + delta * (view === 'week' ? 7 : 1));
      return next;
    });
  };

  // patientName lookup — QueryClientProvider yo'q test harness'da (placeholder; Task 6 da real).
  const patientName = () => '—';

  return (
    <div>
      <PageHead
        title={t('appointments.title')}
        actions={
          hasPermission('appointment.create') ? (
            <Button variant="primary" onClick={open}>
              {t('appointments.create')}
            </Button>
          ) : undefined
        }
      />
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          marginTop: 16,
        }}
      >
        <Tabs
          value={view}
          onChange={(v) => setView(v as 'day' | 'week')}
          variant="pill"
          items={[
            { id: 'day', label: t('appointments.view_day') },
            { id: 'week', label: t('appointments.view_week') },
          ]}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Button variant="default" onClick={() => shift(-1)}>
            ←
          </Button>
          <Button variant="default" onClick={() => setDate(new Date())}>
            {t('appointments.today')}
          </Button>
          <Button variant="default" onClick={() => shift(1)}>
            →
          </Button>
        </div>
      </div>
      <div style={{ marginTop: 16 }}>
        {view === 'day' ? (
          <CalendarGrid
            appointments={appts ?? []}
            doctors={doctors ?? []}
            patientName={patientName}
          />
        ) : (
          <WeekGrid appointments={appts ?? []} dayKeys={dayKeys} patientName={patientName} />
        )}
      </div>
      <Modal opened={opened} onClose={close} title={t('appointments.create')} size="lg">
        <NewAppointmentWizard onClose={close} />
      </Modal>
    </div>
  );
}
