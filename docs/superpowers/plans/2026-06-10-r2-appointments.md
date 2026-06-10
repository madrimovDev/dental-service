# R2-B — Yozilish (kalendar + wizard) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Yozilishni clinik teal dizayniga ko'chirish — multi-doktor custom CSS kalendar (kun + hafta) + 4-qadamli yangi-yozuv wizard, `features/appointments/` (RFC-0010 etalon) bilan, mavjud `appointments.page` funksiyasini (cancel/status/filter/create) yo'qotmasdan.

**Architecture:** `features/appointments/` — RFC-0010 qatlamlar (keys/types/mappers/api/schema/components). Kalendar = custom CSS grid; **grid-positioning + timezone math = REAL mappers (sof funksiya, izolyatsiyada test)**. Wizard = Mantine Stepper + R0 manual binding. Backend o'zgarmaydi.

**Tech Stack:** React 18, TanStack Query, @mantine/core (Stepper/DateTimePicker), @dental/ui (R0), react-i18next, CSS Modules. Timezone: Asia/Tashkent.

**Manba:** clinik `/tmp/clinik_extract/app/{calendar,new-appointment}.html`. Mavjud `apps/web/src/pages/appointments.page.tsx` (274q — capability manbasi). Spec: [`docs/superpowers/specs/2026-06-10-r2-appointments-design.md`](../specs/2026-06-10-r2-appointments-design.md).

**Branch:** `feat/r2-appointments` (allaqachon ochilgan, spec unda).

> **TDD:** mappers (grid-positioning/timezone/lane) unit — eng muhim; wizard step + screen smoke (behavioral). Vizual fidelity — dev + inson.

---

## Task 0: Tayyorgarlik tekshiruvi

- [ ] **Step 1:** Branch tasdiqlash — `git branch --show-current` → `feat/r2-appointments`. clinik: `ls /tmp/clinik_extract/app/calendar.html` (bo'lmasa `unzip -o /home/madrimov/Загрузки/clinik.zip -d /tmp/clinik_extract`).
- [ ] **Step 2:** `bun install` (R2-A merged main'da — `@dental/ui`, test-utils, features/patients mavjud).

---

## Task 1: `features/appointments/` kanonik qatlamlar — keys + types + mappers (REAL)

**Files:**
- Create: `apps/web/src/features/appointments/appointments.keys.ts`
- Create: `apps/web/src/features/appointments/appointments.types.ts`
- Create: `apps/web/src/features/appointments/appointments.mappers.ts`
- Create: `apps/web/src/features/appointments/appointments.mappers.test.ts`

> **Bu task eng muhim** (advisor) — grid-positioning + timezone math. Sof funksiya, izolyatsiyada test. `features/patients/mappers` etalonini kuchaytiradi.

- [ ] **Step 1: `appointments.keys.ts`**

```ts
export const appointmentKeys = {
  all: ['appointments'] as const,
  list: (params: { branchId?: string; from: string; to: string }) =>
    ['appointments', 'list', params] as const,
};
```

- [ ] **Step 2: `appointments.types.ts`**

```ts
import type { Appointment, AppointmentStatus } from '@dental/api-client';

export type Doctor = { id: string; name: string };

/** Grid pozitsiyasi (px). */
export type SlotPosition = { top: number; height: number; lane: number; laneCount: number };

/** Kalendar slot — appointment + pozitsiya + ko'rsatish maydonlari. */
export type CalendarEvent = {
  appointment: Appointment;
  doctorId: string;
  startMin: number; // kun boshidan local daqiqa
  endMin: number;
  pos: SlotPosition;
};

export type DoctorColumn = { doctor: Doctor; events: CalendarEvent[] };

export const GRID = {
  dayStartHour: 8,
  dayEndHour: 20,
  stepMin: 30,
  pxPerMin: 40 / 30, // 40px / 30 daqiqa
} as const;

export type { Appointment, AppointmentStatus };
```

- [ ] **Step 3: Failing test — `appointments.mappers.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { localMinutes, toSlotPosition, assignLanes } from './appointments.mappers';
import { GRID } from './appointments.types';
import type { Appointment } from '@dental/api-client';

function appt(start: string, end: string, id = 'a'): Appointment {
  return {
    id, tenantId: 't', branchId: 'b', patientId: 'p', doctorId: 'd',
    assistantId: null, startTime: start, endTime: end, status: 'scheduled',
    serviceIds: [], notes: null, cancellationReason: null, createdAt: '', updatedAt: '',
  };
}

describe('appointments.mappers — timezone + grid', () => {
  it('localMinutes UTC→Asia/Tashkent (UTC+5)', () => {
    // 2026-06-10T05:00:00Z → Tashkent 10:00 → 600 daqiqa
    expect(localMinutes('2026-06-10T05:00:00Z')).toBe(600);
  });

  it('toSlotPosition: 10:00–10:30, kun boshi 08:00, 40px/30min', () => {
    // 10:00 = 600 min; dayStart 08:00 = 480 min; (600-480)=120 min × (40/30) = 160px top
    const pos = toSlotPosition(600, 630, GRID);
    expect(pos.top).toBe(160);
    expect(pos.height).toBe(40); // 30 min × 40/30
  });

  it('assignLanes: overlapping events get separate lanes', () => {
    const a = { startMin: 600, endMin: 660 };
    const b = { startMin: 630, endMin: 690 }; // overlaps a
    const c = { startMin: 700, endMin: 730 }; // no overlap
    const laned = assignLanes([a, b, c]);
    expect(laned[0].lane).toBe(0);
    expect(laned[1].lane).toBe(1); // overlaps a → lane 1
    expect(laned[1].laneCount).toBe(2);
    expect(laned[2].lane).toBe(0); // no overlap → lane 0
  });
});
```

- [ ] **Step 4: Test fail** — Run: `cd apps/web && bunx vitest run src/features/appointments/appointments.mappers` → FAIL.

- [ ] **Step 5: `appointments.mappers.ts`**

```ts
import type { Appointment } from '@dental/api-client';
import type { CalendarEvent, Doctor, DoctorColumn } from './appointments.types';
import { GRID } from './appointments.types';

const TZ = 'Asia/Tashkent';

/** UTC ISO → kun boshidan local (Asia/Tashkent) daqiqa. */
export function localMinutes(iso: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(iso));
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  return h * 60 + m;
}

/** Local sana kaliti (YYYY-MM-DD, Asia/Tashkent) — guruhlash uchun. */
export function localDateKey(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(iso));
}

export function localTimeLabel(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(iso));
}

type Laned<T> = T & { lane: number; laneCount: number };

/** Pozitsiya (top/height px) — lane'siz (lane assignLanes'dan). */
export function toSlotPosition(startMin: number, endMin: number, grid = GRID) {
  const dayStart = grid.dayStartHour * 60;
  const top = (startMin - dayStart) * grid.pxPerMin;
  const height = Math.max((endMin - startMin) * grid.pxPerMin, grid.pxPerMin * 10);
  return { top, height };
}

/** Overlap lane tayinlash: ustma-ust eventlar yonma-yon lane. */
export function assignLanes<T extends { startMin: number; endMin: number }>(events: T[]): Laned<T>[] {
  const sorted = [...events].sort((a, b) => a.startMin - b.startMin);
  const laneEnds: number[] = []; // har lane oxirgi endMin
  const out: Laned<T>[] = sorted.map((e) => {
    let lane = laneEnds.findIndex((end) => end <= e.startMin);
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(e.endMin); }
    else laneEnds[lane] = e.endMin;
    return { ...e, lane, laneCount: 1 };
  });
  // laneCount = overlap klasterdagi maksimal lane+1 (sodda: umumiy lane soni)
  const total = laneEnds.length || 1;
  for (const e of out) e.laneCount = total;
  return out;
}

/** Appointment[] → bir doktor uchun CalendarEvent[] (pozitsiya + lane). */
export function toDoctorEvents(appts: Appointment[], grid = GRID): CalendarEvent[] {
  const base = appts.map((a) => ({
    appointment: a, doctorId: a.doctorId,
    startMin: localMinutes(a.startTime), endMin: localMinutes(a.endTime),
  }));
  const laned = assignLanes(base);
  return laned.map((e) => ({
    ...e,
    pos: { ...toSlotPosition(e.startMin, e.endMin, grid), lane: e.lane, laneCount: e.laneCount },
  }));
}

/** Day view: doktor bo'yicha ustunlar. */
export function groupByDoctor(appts: Appointment[], doctors: Doctor[], grid = GRID): DoctorColumn[] {
  return doctors.map((doctor) => ({
    doctor,
    events: toDoctorEvents(appts.filter((a) => a.doctorId === doctor.id), grid),
  }));
}
```

- [ ] **Step 6: Test pass** — Run: `cd apps/web && bunx vitest run src/features/appointments/appointments.mappers` → 3 PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/features/appointments
git commit -m "feat(web): features/appointments kanonik — keys + types + mappers (grid-positioning REAL)"
```

---

## Task 2: api.ts (hooks) + schema.ts (wizard)

**Files:**
- Create: `apps/web/src/features/appointments/appointments.api.ts`
- Create: `apps/web/src/features/appointments/appointments.schema.ts`

- [ ] **Step 1: `appointments.api.ts`** (YAGONA client qatlam)

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api.ts';
import { appointmentKeys } from './appointments.keys';
import type { Doctor } from './appointments.types';

export function useAppointments(range: { branchId?: string; from: string; to: string }) {
  return useQuery({
    queryKey: appointmentKeys.list(range),
    queryFn: () => api.appointments.list({ branchId: range.branchId, from: range.from, to: range.to }),
  });
}

/** Branch doktorlari — listAssignments (roleName ≈ doctor). */
export function useDoctors() {
  return useQuery({
    queryKey: ['doctors', 'list'],
    queryFn: async (): Promise<Doctor[]> => {
      const assignments = await api.users.listAssignments();
      const docs = assignments
        .filter((a) => a.roleName.toLowerCase().includes('doctor'))
        .map((a) => ({ id: a.userId, name: a.userFullName ?? a.userPhone }));
      return Array.from(new Map(docs.map((d) => [d.id, d])).values());
    },
  });
}

export function useCreateAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Parameters<typeof api.appointments.create>[0]) => api.appointments.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: appointmentKeys.all }),
  });
}

export function useCancelAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) => api.appointments.cancel(id, reason),
    onSuccess: () => qc.invalidateQueries({ queryKey: appointmentKeys.all }),
  });
}
```
> `api.patients.list`, `api.services.list`, `api.branches.list` wizard'da bevosita (yoki kichik hooks) — bular boshqa feature'lar; wizard'da `useQuery` bilan o'ralishi mumkin (yoki tegishli feature hook). Hozir wizard'da to'g'ridan `api` qabul qilinadi (cross-feature read), lekin appointment mutatsiyalari shu api.ts'da.

- [ ] **Step 2: `appointments.schema.ts`** (wizard)

```ts
import { z } from 'zod';

export const wizardSchema = z.object({
  branchId: z.string().min(1),
  patientId: z.string().min(1),
  doctorId: z.string().min(1),
  serviceIds: z.array(z.string()).default([]),
  startTime: z.date(),
  endTime: z.date(),
  notes: z.string().optional(),
});
export type WizardValues = z.infer<typeof wizardSchema>;
```

- [ ] **Step 3: Typecheck + commit** — `cd apps/web && bun run typecheck` → toza.
```bash
git add apps/web/src/features/appointments
git commit -m "feat(web): appointments api.ts (hooks) + schema.ts (wizard)"
```

---

## Task 3: CalendarGrid (day view) + AppointmentSlot

**Files:**
- Create: `apps/web/src/features/appointments/components/CalendarGrid.tsx`
- Create: `apps/web/src/features/appointments/components/CalendarGrid.module.css`
- Create: `apps/web/src/features/appointments/components/AppointmentSlot.tsx`
- Create: `apps/web/src/features/appointments/components/CalendarGrid.test.tsx`

**clinik referens:** `app/calendar.html` `.cal-grid/.cal-cols/.cal-col/.cal-times/.slot`.

- [ ] **Step 1: Failing test — `CalendarGrid.test.tsx`**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderApp } from '../../../test-utils';
import { CalendarGrid } from './CalendarGrid';
import type { Doctor } from '../appointments.types';
import type { Appointment } from '@dental/api-client';

const doctors: Doctor[] = [{ id: 'd1', name: 'Dr. Ali' }];
const appts: Appointment[] = [{
  id: 'a1', tenantId: 't', branchId: 'b', patientId: 'p1', doctorId: 'd1',
  assistantId: null, startTime: '2026-06-10T05:00:00Z', endTime: '2026-06-10T05:30:00Z',
  status: 'scheduled', serviceIds: [], notes: null, cancellationReason: null, createdAt: '', updatedAt: '',
}];

describe('CalendarGrid', () => {
  it('doktor ustuni va slotni ko\'rsatadi', () => {
    renderApp(<CalendarGrid appointments={appts} doctors={doctors} patientName={() => 'Bemor X'} onSlotClick={vi.fn()} />);
    expect(screen.getByText('Dr. Ali')).toBeInTheDocument();
    expect(screen.getByText('Bemor X')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Test fail** — Run: `cd apps/web && bunx vitest run src/features/appointments/components/CalendarGrid` → FAIL.

- [ ] **Step 3: `CalendarGrid.module.css`** (clinik cal-grid)

```css
.grid { display: flex; border: 1px solid var(--border); border-radius: var(--radius-lg); overflow: hidden; background: var(--surface); }
.times { width: 56px; flex: none; border-right: 1px solid var(--border-subtle); }
.timeLabel { height: 40px; font-family: var(--font-mono); font-size: 10.5px; color: var(--text-3); text-align: right; padding-right: 8px; box-sizing: border-box; }
.cols { display: flex; flex: 1; }
.col { flex: 1; min-width: 120px; border-right: 1px solid var(--border-subtle); position: relative; }
.colHead { height: 40px; display: flex; align-items: center; justify-content: center; gap: 6px; font-size: var(--text-sm); font-weight: 600; border-bottom: 1px solid var(--border-subtle); position: sticky; top: 0; background: var(--surface); }
.colBody { position: relative; }
.hourLine { height: 40px; border-bottom: 1px dashed var(--border-subtle); }
.slot { position: absolute; left: 2px; right: 2px; border-radius: var(--radius-sm); padding: 4px 6px; font-size: var(--text-xs); overflow: hidden; cursor: pointer; border-left: 3px solid var(--primary); background: var(--primary-tint); color: var(--primary-hover); }
.slot[data-status="cancelled"] { opacity: .5; border-left-color: var(--text-3); background: var(--surface-2); color: var(--text-3); }
.slot[data-status="completed"] { border-left-color: var(--success); background: var(--success-bg); color: var(--success); }
.slot[data-status="no_show"] { border-left-color: var(--danger); background: var(--danger-bg); color: var(--danger); }
.slotTime { font-family: var(--font-mono); font-weight: 600; }
```

- [ ] **Step 4: `AppointmentSlot.tsx`**

```tsx
import { localTimeLabel } from '../appointments.mappers';
import type { CalendarEvent } from '../appointments.types';
import classes from './CalendarGrid.module.css';

export function AppointmentSlot({ event, patientName, onClick }: {
  event: CalendarEvent;
  patientName: (patientId: string) => string;
  onClick?: (event: CalendarEvent) => void;
}) {
  const { pos, appointment } = event;
  const width = 100 / pos.laneCount;
  return (
    <button
      type="button"
      className={classes.slot}
      data-status={appointment.status}
      style={{ top: pos.top + 40, height: pos.height, left: `${pos.lane * width}%`, width: `${width}%` }}
      onClick={() => onClick?.(event)}
    >
      <span className={classes.slotTime}>{localTimeLabel(appointment.startTime)}</span>{' '}
      {patientName(appointment.patientId)}
    </button>
  );
}
```
> `top + 40` — colHead balandligi (40px) hisobga olinadi. R0 Button `component` yo'q → native `<button>` (yoki R0 `IconButton` mos emas) — slot custom, native button (a11y) + token CSS.

- [ ] **Step 5: `CalendarGrid.tsx`**

```tsx
import { useTranslation } from 'react-i18next';
import { Avatar } from '@dental/ui';
import type { Appointment } from '@dental/api-client';
import { groupByDoctor } from '../appointments.mappers';
import { GRID, type CalendarEvent, type Doctor } from '../appointments.types';
import { AppointmentSlot } from './AppointmentSlot';
import classes from './CalendarGrid.module.css';

export function CalendarGrid({ appointments, doctors, patientName, onSlotClick }: {
  appointments: Appointment[];
  doctors: Doctor[];
  patientName: (patientId: string) => string;
  onSlotClick?: (event: CalendarEvent) => void;
}) {
  const cols = groupByDoctor(appointments, doctors);
  const hours = Array.from(
    { length: GRID.dayEndHour - GRID.dayStartHour },
    (_, i) => GRID.dayStartHour + i,
  );

  return (
    <div className={classes.grid}>
      <div className={classes.times}>
        <div style={{ height: 40 }} />
        {hours.map((h) => (
          <div key={h} className={classes.timeLabel}>{String(h).padStart(2, '0')}:00</div>
        ))}
      </div>
      <div className={classes.cols}>
        {cols.map((col) => (
          <div key={col.doctor.id} className={classes.col}>
            <div className={classes.colHead}>
              <Avatar name={col.doctor.name} size="sm" /> {col.doctor.name}
            </div>
            <div className={classes.colBody}>
              {hours.map((h) => <div key={h} className={classes.hourLine} />)}
              {col.events.map((e) => (
                <AppointmentSlot key={e.appointment.id} event={e} patientName={patientName} onClick={onSlotClick} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```
> Test'da `onCancel`/`patientName` props plan'dagi test bilan moslashtir (test `onCancel` ishlatadi — agar slot click cancel'ni ochsa, prop nomini izchil qil; bu yerda `onSlotClick`). Test props'ni komponent imzosiga moslashtir.

- [ ] **Step 6: Test pass + commit** — `cd apps/web && bunx vitest run src/features/appointments/components/CalendarGrid && bun run typecheck` → PASS.
```bash
git add apps/web/src/features/appointments
git commit -m "feat(web): CalendarGrid (day view, custom CSS grid) + AppointmentSlot"
```

---

## Task 4: CalendarScreen (day/week toggle + filter + navigatsiya) + week view

**Files:**
- Create: `apps/web/src/features/appointments/components/CalendarScreen.tsx`
- Modify: `apps/web/src/features/appointments/components/CalendarGrid.tsx` (week rejimi yoki WeekGrid)
- Create: `apps/web/src/features/appointments/components/CalendarScreen.test.tsx`
- Create: `apps/web/src/features/appointments/index.ts`

- [ ] **Step 1: Failing test — `CalendarScreen.test.tsx`**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderApp } from '../../../test-utils';
import { CalendarScreen } from './CalendarScreen';

vi.mock('../appointments.api', () => ({
  useAppointments: () => ({ data: [], isLoading: false }),
  useDoctors: () => ({ data: [{ id: 'd1', name: 'Dr. Ali' }] }),
  useCancelAppointment: () => ({ mutate: vi.fn() }),
}));
vi.mock('@/stores/auth-store.ts', () => ({ useAuthStore: () => ({ hasPermission: () => true, activeBranchId: 'b1' }) }));
vi.mock('@/lib/api.ts', () => ({ api: { patients: { list: vi.fn(() => Promise.resolve({ data: [], meta: {} })) }, branches: { list: vi.fn(() => Promise.resolve([])) } } }));

describe('CalendarScreen', () => {
  it('sarlavha va kun/hafta toggle ko\'rsatadi', () => {
    renderApp(<CalendarScreen />);
    expect(screen.getByText('Kun')).toBeInTheDocument();
    expect(screen.getByText('Hafta')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Test fail** — FAIL.

- [ ] **Step 3: `CalendarScreen.tsx`** — day/week state, sana navigatsiya, branch filter, "Yangi yozuv" tugma, grid render.
  - State: `view: 'day'|'week'` (R0 `Tabs` pill: Kun/Hafta), `date` (joriy kun), `branchId`.
  - Range hisobi: day → [date 00:00, date 24:00]; week → [haftaboshi, +7 kun] (Asia/Tashkent).
  - `useAppointments({branchId, from, to})`, `useDoctors()`, `patientName` (api.patients.list map yoki feature).
  - `PageHead` (sarlavha + "Yangi yozuv" Button → wizard ochish, `appointment.create`).
  - Sana navigatsiya (← Bugun →), branch `Select`.
  - Day: `<CalendarGrid>` (doktor ustunlar). Week: `<WeekGrid>` (7 kun ustunlar — kun generalizatsiyasi; bitta doktor tanlovi yoki barcha). Wizard (`NewAppointmentWizard`) modal/route.

```tsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Select } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { PageHead, Button, Tabs } from '@dental/ui';
import { useAuthStore } from '@/stores/auth-store.ts';
import { useAppointments, useDoctors } from '../appointments.api';
import { CalendarGrid } from './CalendarGrid';
// import { NewAppointmentWizard } from './NewAppointmentWizard'; // Task 5

export function CalendarScreen() {
  const { t } = useTranslation();
  const { hasPermission, activeBranchId } = useAuthStore();
  const [view, setView] = useState<'day' | 'week'>('day');
  const [date] = useState(() => new Date());
  const [opened, { open, close }] = useDisclosure(false);
  // range hisobi (Asia/Tashkent kun chegaralari) — soddalashtirilgan: kun [00:00,24:00] local→UTC
  const dayStart = new Date(date); dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + (view === 'week' ? 7 : 1));
  const { data: appts } = useAppointments({ branchId: activeBranchId ?? undefined, from: dayStart.toISOString(), to: dayEnd.toISOString() });
  const { data: doctors } = useDoctors();

  return (
    <div>
      <PageHead
        title={t('appointments.title')}
        actions={hasPermission('appointment.create') && (
          <Button variant="primary" onClick={open}>{t('appointments.create')}</Button>
        )}
      />
      <Tabs value={view} onChange={(v) => setView(v as 'day' | 'week')}
        variant="pill" items={[{ id: 'day', label: t('appointments.view_day') }, { id: 'week', label: t('appointments.view_week') }]} />
      {/* sana navigatsiya + branch filter — qisqartirilgan */}
      <div style={{ marginTop: 16 }}>
        <CalendarGrid appointments={appts ?? []} doctors={doctors ?? []} patientName={() => '—'} />
      </div>
      {/* {opened && <NewAppointmentWizard onClose={close} />} */}
    </div>
  );
}
```
> Test'da "Kun"/"Hafta" — i18n `appointments.view_day/week` (uz: "Kun"/"Hafta"). `patientName` — `api.patients.list` (pageSize 100) map yoki `usePatients` hook; qisqartirilgan. Week view (WeekGrid) — day grid generalizatsiyasi (7 kun ustun); plan ichida day'dan keyin. Wizard ulash — Task 5'da kommentdan ochiladi.

- [ ] **Step 4: `index.ts`** → `export { CalendarScreen } from './components/CalendarScreen';`

- [ ] **Step 5: Test pass + commit** — PASS;
```bash
git add apps/web/src/features/appointments
git commit -m "feat(web): CalendarScreen (day/week toggle, filter, navigatsiya) + index"
```

> **Week view:** day grid generalizatsiyasi — 7 kun ustun (har kun bitta doktor tanlovi yoki barcha doktorlar). `groupByDay` mapper (Task 1 uslubida — agar Task 1'da yo'q bo'lsa shu yerda qo'sh: kun bo'yicha `localDateKey` guruh). Day view to'liq ishlagach week qo'shiladi (advisor tartibi).

---

## Task 5: NewAppointmentWizard (4 qadam)

**Files:**
- Create: `apps/web/src/features/appointments/components/NewAppointmentWizard.tsx`
- Create: `apps/web/src/features/appointments/components/NewAppointmentWizard.test.tsx`

**clinik referens:** `app/new-appointment.html` (step 0–3). Mantine `Stepper` + R0 manual binding.

- [ ] **Step 1: Failing test — `NewAppointmentWizard.test.tsx`**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderApp } from '../../../test-utils';
import { NewAppointmentWizard } from './NewAppointmentWizard';

vi.mock('../appointments.api', () => ({
  useCreateAppointment: () => ({ mutate: vi.fn(), isPending: false }),
  useDoctors: () => ({ data: [{ id: 'd1', name: 'Dr. Ali' }] }),
}));
vi.mock('@/lib/api.ts', () => ({ api: {
  patients: { list: vi.fn(() => Promise.resolve({ data: [], meta: {} })) },
  services: { list: vi.fn(() => Promise.resolve([])) },
  branches: { list: vi.fn(() => Promise.resolve([])) },
} }));
vi.mock('@/stores/auth-store.ts', () => ({ useAuthStore: () => ({ activeBranchId: 'b1' }) }));

describe('NewAppointmentWizard', () => {
  it('birinchi qadam (Bemor) ko\'rsatadi', () => {
    renderApp(<NewAppointmentWizard onClose={vi.fn()} />);
    expect(screen.getByText('Bemor')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Test fail** — FAIL.

- [ ] **Step 3: `NewAppointmentWizard.tsx`** — Mantine `Stepper` (4 qadam) + `@mantine/form` + manual binding.
  - Qadamlar: **0 Bemor** (Select searchable, `api.patients.list`), **1 Doktor + Xizmat** (`useDoctors` Select, `api.services.list` MultiSelect), **2 Vaqt** (DateTimePicker start/end yoki slot tanlash), **3 Tasdiq** (xulosa → `create`).
  - `active` state (0–3). Keyingi/Orqaga Button (R0). Har qadam qism-validatsiya.
  - `useCreateAppointment().mutate(values, { onSuccess: onClose + invalidate, onError: conflict 409 → xato })`.

```tsx
import { useState } from 'react';
import { Stepper, Select, MultiSelect } from '@mantine/core';
import { DateTimePicker } from '@mantine/dates';
import { useForm } from '@mantine/form';
import { zodResolver } from 'mantine-form-zod-resolver';
import { useTranslation } from 'react-i18next';
import { Button } from '@dental/ui';
import { useAuthStore } from '@/stores/auth-store.ts';
import { useCreateAppointment, useDoctors } from '../appointments.api';
import { wizardSchema, type WizardValues } from '../appointments.schema';

export function NewAppointmentWizard({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { activeBranchId } = useAuthStore();
  const [active, setActive] = useState(0);
  const { data: doctors } = useDoctors();
  const createMut = useCreateAppointment();
  const form = useForm<WizardValues>({
    initialValues: {
      branchId: activeBranchId ?? '', patientId: '', doctorId: '',
      serviceIds: [], startTime: new Date(), endTime: new Date(Date.now() + 30 * 60000), notes: '',
    },
    validate: zodResolver(wizardSchema),
  });

  const submit = () => createMut.mutate(
    { ...form.values, startTime: form.values.startTime.toISOString(), endTime: form.values.endTime.toISOString() },
    { onSuccess: onClose },
  );

  return (
    <div>
      <Stepper active={active} onStepClick={setActive}>
        <Stepper.Step label={t('appointments.step_patient')}>{/* Bemor Select */}</Stepper.Step>
        <Stepper.Step label={t('appointments.step_service')}>{/* Doktor + Xizmat */}</Stepper.Step>
        <Stepper.Step label={t('appointments.step_time')}>{/* Vaqt */}</Stepper.Step>
        <Stepper.Step label={t('appointments.step_confirm')}>{/* Tasdiq */}</Stepper.Step>
      </Stepper>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
        <Button variant="default" onClick={() => (active === 0 ? onClose() : setActive(active - 1))}>
          {active === 0 ? t('common.cancel') : t('common.back')}
        </Button>
        {active < 3
          ? <Button variant="primary" onClick={() => setActive(active + 1)}>{t('common.next')}</Button>
          : <Button variant="primary" disabled={createMut.isPending} onClick={submit}>{t('common.save')}</Button>}
      </div>
    </div>
  );
}
```
> Stepper bo'sh `Step` body'lari qadam mazmuni bilan to'ldiriladi (Bemor/Doktor/Xizmat Select, DateTimePicker, Tasdiq xulosa) — R0 `Input`/`Select` **manual binding** (`value`+`onChange`); Mantine `Select`/`DateTimePicker`/`MultiSelect` `getInputProps` qabul qiladi. Conflict 409 → `onError` da xato xabari (`Notifications`). Test'da "Bemor" — `appointments.step_patient` (uz: "Bemor").

- [ ] **Step 4: Test pass + commit** — PASS;
```bash
git add apps/web/src/features/appointments
git commit -m "feat(web): NewAppointmentWizard (4 qadam Stepper + manual binding)"
```

---

## Task 6: Capability migratsiya (cancel/status) + page thin entry

**Files:**
- Modify: `apps/web/src/features/appointments/components/CalendarScreen.tsx` (slot click → detail/cancel, wizard ulash)
- Modify: `apps/web/src/features/appointments/components/CalendarGrid.tsx` (onSlotClick)
- Modify: `apps/web/src/pages/appointments.page.tsx` (→ thin entry)

> Mavjud `appointments.page` capability (R2-A saboq — yo'qotilmaydi): **cancel**, **status**, **branch filter**, **create**. Status grid'da (data-status rangi — Task 3 ✅). Filter + create CalendarScreen'da (Task 4/5). Bu task: **cancel** + slot detail + wizard ulash + page thin.

- [ ] **Step 1: Slot click → detail modal (cancel)** — `CalendarScreen.tsx`:
  - `selectedEvent` state; slot click → Mantine `Modal` (appointment detail: vaqt `Mono`, bemor, doktor, xizmatlar, status `StatusPill`).
  - **Cancel:** `useCancelAppointment()`, `appointment.cancel` permission, status≠cancelled/completed. Reason — Mantine `Textarea`/R0 `Input` (mavjud `prompt` o'rniga). Tasdiqdan keyin mutate + modal yopish.
  - **Wizard ulash:** "Yangi yozuv" → `NewAppointmentWizard` Modal (Task 5).

- [ ] **Step 2: `appointments.page.tsx` → thin entry**

```tsx
import { CalendarScreen } from '@/features/appointments';
export function AppointmentsPage() {
  return <CalendarScreen />;
}
```

- [ ] **Step 3: Verifikatsiya** — `cd apps/web && bunx vitest run src/features/appointments && bun run typecheck` → PASS. Eski `appointments.page` inline create/cancel/list mantiqi feature'ga ko'chgan — page'da qoldiq yo'q (grep: `grep -n "useMutation\|api.appointments" apps/web/src/pages/appointments.page.tsx` → bo'sh).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features/appointments apps/web/src/pages/appointments.page.tsx
git commit -m "feat(web): appointment cancel/detail modal + wizard ulash + thin page entry"
```

---

## Task 7: i18n — appointments.* (uz + ru)

**Files:**
- Modify: `packages/i18n/src/locales/uz.json`
- Modify: `packages/i18n/src/locales/ru.json`

- [ ] **Step 1: `uz.json` — `appointments` kengaytir** (mavjud kalitlar saqlanadi)

```json
"appointments": {
  "title": "Yozilishlar",
  "create": "Yangi yozuv",
  "view_day": "Kun",
  "view_week": "Hafta",
  "today": "Bugun",
  "filter_branch": "Filial",
  "step_patient": "Bemor",
  "step_service": "Doktor va xizmat",
  "step_time": "Vaqt",
  "step_confirm": "Tasdiq",
  "patient": "Bemor",
  "doctor": "Doktor",
  "services": "Xizmatlar",
  "start_time": "Boshlanish",
  "end_time": "Tugash",
  "notes": "Izoh",
  "cancel_reason": "Bekor qilish sababi",
  "conflict": "Doktor bu vaqtda band",
  "empty": "Yozuvlar yo'q",
  "status": {
    "scheduled": "Rejalashtirilgan", "confirmed": "Tasdiqlangan", "in_progress": "Jarayonda",
    "completed": "Yakunlangan", "no_show": "Kelmadi", "cancelled": "Bekor qilingan"
  }
}
```
> Mavjud `appointments.*` kalitlar (title, status.*, create...) bo'lsa — saqla/birlashtir. `common.next/back/cancel/save` mavjudligini tekshir (yo'q bo'lsa qo'sh: next "Keyingi", back "Orqaga").

- [ ] **Step 2: `ru.json` — bir xil struktura, ruscha** (Записи, Новая запись, День/Неделя, qadamlar, status).

- [ ] **Step 3: JSON valid + commit**

Run: `node -e "JSON.parse(require('fs').readFileSync('packages/i18n/src/locales/uz.json')); JSON.parse(require('fs').readFileSync('packages/i18n/src/locales/ru.json')); console.log('valid')"`
```bash
git add packages/i18n/src/locales
git commit -m "feat(i18n): appointments.* (kalendar/wizard/status) uz+ru"
```

---

## Task 8: Verifikatsiya (build + test + dev fidelity)

- [ ] **Step 1: To'liq suite**

```bash
bun install
turbo test --filter @dental/web
bun --filter @dental/web build   # exit 0
bun --filter @dental/web typecheck
```
Expected: yashil. (`turbo` PATH'da bo'lmasa `bunx turbo`.)

- [ ] **Step 2: Dev fidelity (inson)** — to'liq stack (DB kerak):
```bash
export DOCKER_API_VERSION=1.51
docker compose -f infra/docker-compose.yml up -d
bun --filter @dental/api dev    # 8001
bun --filter @dental/web dev    # 8000
```
`http://localhost:8000/appointments` (login → shell):
- **Kalendar (kun):** doktor ustunlari, vaqt qatorlari, slotlar **to'g'ri vaqtda** (Asia/Tashkent — 5-soat siljish yo'q), status ranglari, overlap lane.
- **Hafta:** 7 kun ustun.
- **Wizard:** "Yangi yozuv" → 4 qadam (Bemor/Doktor+Xizmat/Vaqt/Tasdiq) → yozuv yaratiladi; band vaqt → conflict xato.
- **Cancel:** slot → detail modal → bekor qilish (reason).
- **Filter:** branch.
- clinik `calendar.html`/`new-appointment.html` bilan mos.

- [ ] **Step 3: Dev stack yopish** — `docker compose -f infra/docker-compose.yml down` + dev process'larni to'xtatish.

---

## Yakuniy holat (Definition of Done)

- [ ] `features/appointments/` kanonik (keys/types/mappers REAL grid-positioning+timezone/api/schema/components).
- [ ] Kalendar: kun + hafta, multi-doktor custom CSS grid, slot to'g'ri pozitsiya (Asia/Tashkent), overlap lane, status rangi.
- [ ] Wizard: 4 qadam (Stepper + manual binding) + conflict ishlov.
- [ ] Capability migratsiya: cancel/status/filter/create — yo'qotilmagan. `appointments.page` yupqa entry.
- [ ] i18n `appointments.*` uz+ru. R0 primitivlar + token.
- [ ] `turbo test` + build yashil; mapper testlari (positioning/lane/timezone) o'tadi.
- [ ] Dev fidelity clinik bilan mos (inson).
- [ ] Linear CLI-46 (+ CLI-47 kalendar, CLI-48 wizard) yopiladi.

## Keyingi qadam
- PR `feat/r2-appointments` → main.
- Keyingi R2 guruh: Navbat (CLI-37), Kassa (CLI-49), Xizmatlar (CLI-36), Settings (CLI-60) — `features/` etalonini nusxalaydi.

## Ochiq mayda nuqtalar (plan'da hal qilingan / kuzatiladi)
- Ish soatlari (08:00–20:00) / slot qadam (30min) — `GRID` konstanta (Task 1). Kerak bo'lsa branch konfiguratsiyasi keyin.
- Week view doktor strategiyasi (har kun bitta doktor vs barcha) — Task 4'da hal.
- `assignLanes` laneCount sodda (umumiy lane soni) — murakkab klaster bo'linishi keyin sayqal.
- Cancel reason UI (Mantine Modal + Textarea) — `prompt` o'rniga.
