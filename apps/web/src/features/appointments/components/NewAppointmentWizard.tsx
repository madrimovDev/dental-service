import { ApiError } from '@dental/api-client';
import { Button } from '@dental/ui';
import { Alert, Select } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { useForm } from '@mantine/form';
import { useDebouncedValue } from '@mantine/hooks';
import { AlertTriangle, ArrowLeft } from 'lucide-react';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { usePatients } from '@/features/patients';
import { useAvailability } from '@/features/schedule/schedule.api';
import { localDateParam, slotTimeLabel } from '@/features/schedule/schedule.mappers';
import { useAuthStore } from '@/stores/auth-store.ts';
import {
  useBookingContext,
  useBranches,
  useCreateAppointment,
  useDoctors,
  useServices,
} from '../appointments.api';
import { type WizardValues, wizardSchema } from '../appointments.schema';
import type { UnavailableSlot } from '../appointments.types';
import styles from './NewAppointmentWizard.module.css';

type Option = { value: string; label: string };

/**
 * A10 (CLI-438): backend 409 kodini aniq xabarga aylantiradi. `appointments.conflict`
 * mavjud kalit faqat `doctor_busy` uchun ishlatiladi. Qolgan ikkitasi (ish-soati /
 * time-off) uchun yangi i18n kalit kerak bo'lardi, lekin bu pass faqat `apps/web/**`
 * ownership'ga ega — `packages/i18n`ga tegilmaydi. Inline TODO-literal (uz/ru) —
 * handoff: keyingi pass `appointments.outside_working_hours` /
 * `appointments.doctor_on_time_off` i18n kalitlarini qo'shib shu literal'larni
 * almashtirsin.
 */
function conflictMessage(err: unknown, t: (key: string) => string, lang: string): string {
  if (!(err instanceof ApiError)) return t('common.error');
  switch (err.code) {
    case 'conflict.doctor_busy':
      return t('appointments.conflict');
    case 'conflict.patient_busy':
      // CLI-471: bemor shu vaqtda boshqa yozilishga ega.
      return t('appointments.patient_conflict');
    case 'schedule.outside_working_hours':
      return t('appointments.outside_working_hours');
    case 'schedule.doctor_on_time_off':
      // TODO i18n key: appointments.doctor_on_time_off (uz.json/ru.json)
      return lang === 'ru' ? 'Доктор в этот день в отпуске' : "Doktor shu kuni ta'tilda";
    default:
      return t('common.error');
  }
}

const TZ = 'Asia/Tashkent';
/** Slot shu klinika-local soatdan oldin bo'lsa «Ertalab», aks holda «Tushdan keyin». */
const NOON_MINUTE = 12 * 60;

function localMinute(iso: string): number {
  const [h, m] = slotTimeLabel(iso).split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

type SlotCell = { start: string; end: string; reason: UnavailableSlot['reason'] | null };

/**
 * UI-R3: bitta ekranli yozilish — 1 Bemor · 2 Xizmat · 3 Shifokor · 4 Vaqt + yopishqoq
 * xulosa. Yo'q slot yonida sabab (SC-07), lab muddati ogohlantirishi, reja bosqichi
 * taklifi va Telegram eslatma matni oldindan ko'rinadi.
 */
export function NewAppointmentWizard({ onClose }: { onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { activeBranchId, hasPermission } = useAuthStore();
  const [error, setError] = useState<string | null>(null);
  const { data: doctors } = useDoctors();
  // CLI-454: bemor qidiruvi serverga debounced uzatiladi (100 ta chegarasiz ro'yxat emas).
  const [patientSearch, setPatientSearch] = useState('');
  const [debouncedPatientSearch] = useDebouncedValue(patientSearch, 300);
  const { data: patientsData } = usePatients({
    search: debouncedPatientSearch,
    page: 1,
    pageSize: 100,
  });
  const { data: servicesData } = useServices({ enabled: hasPermission('service.view') });
  const { data: branchesData } = useBranches();
  const createMut = useCreateAppointment();

  // Tenant-wide foydalanuvchi (activeBranchId=null) filialni shu ekranda tanlaydi (CLI-151).
  const needsBranchSelect = activeBranchId == null;
  const branchOptions: Option[] = (branchesData ?? []).map((b) => ({ value: b.id, label: b.name }));

  const patients: Option[] = (patientsData?.items ?? []).map((p) => ({
    value: p.id,
    label: p.fullName,
  }));

  const form = useForm<WizardValues>({
    initialValues: {
      branchId: activeBranchId ?? '',
      patientId: '',
      doctorId: '',
      serviceIds: [],
      date: new Date(),
      startTime: null,
      endTime: null,
      notes: '',
    },
    validate: zod4Resolver(wizardSchema),
  });

  const doctorOptions: Option[] = (doctors ?? []).map((d) => ({ value: d.id, label: d.name }));

  // slotMinutes = Σ tanlangan xizmatlar davomiyligi (xizmat yo'q → 0 → availability o'chiq).
  const durationByService = useMemo(
    () => new Map((servicesData ?? []).map((s) => [s.id, s.durationMinutes])),
    [servicesData],
  );
  const slotMinutes = form.values.serviceIds.reduce(
    (sum, id) => sum + (durationByService.get(id) ?? 0),
    0,
  );

  const dateParam = localDateParam(form.values.date);
  const { data: availability, isLoading: slotsLoading } = useAvailability({
    doctorId: form.values.doctorId || null,
    branchId: form.values.branchId || null,
    date: dateParam,
    slotMinutes,
  });
  const freeSlots = availability?.slots ?? [];
  // Backend `unavailable` (SC-07) — generated tipda regen'gacha yo'q.
  const unavailable =
    (availability as { unavailable?: UnavailableSlot[] } | undefined)?.unavailable ?? [];

  // Baza (doktor/filial/sana/davomiylik) o'zgarsa — eski slot tanlovi tozalanadi.
  const basis = `${form.values.doctorId}|${form.values.branchId}|${dateParam}|${slotMinutes}`;
  const prevBasis = useRef(basis);
  // biome-ignore lint/correctness/useExhaustiveDependencies: faqat baza string o'zgarsa ishlaydi
  useEffect(() => {
    if (prevBasis.current !== basis) {
      prevBasis.current = basis;
      form.setFieldValue('startTime', null);
      form.setFieldValue('endTime', null);
    }
  }, [basis]);

  const cells: SlotCell[] = useMemo(() => {
    const all: SlotCell[] = [
      ...freeSlots.map((s) => ({ start: s.start, end: s.end, reason: null })),
      ...unavailable.map((u) => ({ start: u.start, end: u.end, reason: u.reason })),
    ];
    return all.sort((a, b) => a.start.localeCompare(b.start));
  }, [freeSlots, unavailable]);
  const morning = cells.filter((c) => localMinute(c.start) < NOON_MINUTE);
  const afternoon = cells.filter((c) => localMinute(c.start) >= NOON_MINUTE);

  const { data: bookingCtx } = useBookingContext(form.values.patientId || null);
  const plan = bookingCtx?.nextPlanStage ?? null;

  const submit = () => {
    setError(null);
    // A10: majburiy maydonlar submit'dan oldin tekshiriladi (inline xato).
    const result = form.validate();
    if (result.hasErrors) return;
    if (!form.values.startTime || !form.values.endTime) return;
    createMut.mutate(
      {
        branchId: form.values.branchId,
        patientId: form.values.patientId,
        doctorId: form.values.doctorId,
        serviceIds: form.values.serviceIds,
        startTime: form.values.startTime,
        endTime: form.values.endTime,
        notes: form.values.notes,
      },
      {
        onSuccess: onClose,
        onError: (err) => setError(conflictMessage(err, t, i18n.language)),
      },
    );
  };

  const toggleService = (id: string) => {
    const cur = form.values.serviceIds;
    form.setFieldValue('serviceIds', cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
  };

  const applyPlan = () => {
    if (!plan) return;
    if (plan.serviceId) form.setFieldValue('serviceIds', [plan.serviceId]);
    form.setFieldValue('doctorId', plan.doctorId);
  };

  const selectedPatient = patientsData?.items.find((p) => p.id === form.values.patientId) ?? null;
  const selectedDoctor = doctorOptions.find((d) => d.value === form.values.doctorId)?.label ?? null;
  const branchName =
    branchOptions.find((b) => b.value === form.values.branchId)?.label ?? t('appointments.branch');
  const slotPicked = form.values.startTime != null;

  const lang = i18n.language === 'ru' ? 'ru-RU' : 'uz-UZ';
  const dateLabel = (iso: string) =>
    new Intl.DateTimeFormat(lang, { timeZone: TZ, day: 'numeric', month: 'long' }).format(
      new Date(iso),
    );
  const slotDateLabel = form.values.startTime ? dateLabel(form.values.startTime) : null;

  // Lab muddati: tanlangan slot (yo'q bo'lsa — tanlangan sana) lab kelish sanasidan oldin bo'lsa ogohlantirish.
  const compareIso = form.values.startTime ?? `${dateParam}T00:00:00+05:00`;
  const lateLab = (bookingCtx?.openLabOrders ?? []).find(
    (l) => l.expectedDate != null && new Date(l.expectedDate) > new Date(compareIso),
  );

  const slotButton = (c: SlotCell) =>
    c.reason == null ? (
      <button
        key={c.start}
        type="button"
        className={styles.slot}
        aria-pressed={form.values.startTime === c.start}
        onClick={() => {
          form.setFieldValue('startTime', c.start);
          form.setFieldValue('endTime', c.end);
        }}
      >
        {slotTimeLabel(c.start)}
      </button>
    ) : (
      <button key={c.start} type="button" className={styles.slotOff} aria-disabled="true">
        {slotTimeLabel(c.start)}
        <span className={styles.why}>
          {t(`booking.reason_${c.reason}`, { minutes: slotMinutes })}
        </span>
      </button>
    );

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <Button variant="default" onClick={onClose} aria-label={t('booking.back')}>
          <ArrowLeft size={16} aria-hidden />
        </Button>
        <div className={styles.headText}>
          <h1 className={styles.title}>{t('booking.title')}</h1>
          <span className={styles.subtitle}>{t('booking.subtitle')}</span>
        </div>
      </div>

      <div className={styles.body}>
        <div className={styles.left}>
          <section className={styles.card} aria-labelledby="bk-patient">
            <h2 className={styles.cardTitle} id="bk-patient">
              <span className={styles.step}>1</span> · {t('booking.patient_h')}
            </h2>
            {needsBranchSelect && (
              <Select
                key="branch-select"
                label={t('appointments.branch')}
                placeholder={t('appointments.branch')}
                searchable
                data={branchOptions}
                {...form.getInputProps('branchId')}
              />
            )}
            <Select
              key="patient-select"
              placeholder={t('appointments.patient')}
              aria-label={t('appointments.patient')}
              searchable
              data={patients}
              searchValue={patientSearch}
              onSearchChange={setPatientSearch}
              {...form.getInputProps('patientId')}
            />
            {selectedPatient != null && (
              <div className={styles.patientCard}>
                <b>{selectedPatient.fullName}</b>
                {selectedPatient.phone && (
                  <span className={styles.subtitle}>{selectedPatient.phone}</span>
                )}
                {selectedPatient.flagged && (
                  <Alert color="red" variant="light" icon={<AlertTriangle size={16} />}>
                    {t('appointments.patient_flagged', { count: selectedPatient.noShowStrikes })}
                  </Alert>
                )}
                {plan != null && (
                  <div className={styles.chips}>
                    <span className={styles.subtitle}>
                      {t('booking.plan_suggest', {
                        plan: plan.planTitle,
                        n: plan.sequence,
                        stage: plan.serviceName,
                      })}
                    </span>
                    <Button variant="default" onClick={applyPlan}>
                      {t('booking.plan_apply')}
                    </Button>
                  </div>
                )}
              </div>
            )}
            <Button variant="default" onClick={() => navigate('/patients/new')}>
              {t('booking.new_patient')}
            </Button>
          </section>

          <section className={styles.card} aria-labelledby="bk-service">
            <h2 className={styles.cardTitle} id="bk-service">
              <span className={styles.step}>2</span> · {t('booking.service_h')}
            </h2>
            <div className={styles.chips}>
              {(servicesData ?? []).map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={styles.choice}
                  aria-pressed={form.values.serviceIds.includes(s.id)}
                  onClick={() => toggleService(s.id)}
                >
                  <b>{s.nameUz}</b>
                  <span className={styles.choiceMeta}>
                    {s.durationMinutes} {t('booking.minutes_short')}
                  </span>
                </button>
              ))}
            </div>
            {slotMinutes > 0 && (
              <span className={styles.subtitle}>
                {t('booking.total', { minutes: slotMinutes })}
              </span>
            )}
          </section>

          <section className={styles.card} aria-labelledby="bk-doctor">
            <h2 className={styles.cardTitle} id="bk-doctor">
              <span className={styles.step}>3</span> · {t('booking.doctor_h')}
            </h2>
            <div className={styles.chips}>
              {doctorOptions.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  className={styles.choice}
                  aria-pressed={form.values.doctorId === d.value}
                  onClick={() => form.setFieldValue('doctorId', d.value)}
                >
                  <b>{d.label}</b>
                </button>
              ))}
            </div>
          </section>
        </div>

        <section className={`${styles.card} ${styles.right}`} aria-labelledby="bk-time">
          <h2 className={styles.cardTitle} id="bk-time">
            <span className={styles.step}>4</span> · {t('booking.time_h')}
            {selectedDoctor ? ` — ${selectedDoctor}` : ''}
            {slotMinutes > 0 ? `, ${slotMinutes} ${t('booking.minutes_short')}` : ''}
          </h2>
          <DatePickerInput
            label={t('appointments.date')}
            valueFormat="DD.MM.YYYY"
            value={form.values.date}
            onChange={(d) => form.setFieldValue('date', d ?? new Date())}
          />
          {slotMinutes <= 0 || !form.values.doctorId ? (
            <span className={styles.subtitle}>
              {t(
                slotMinutes <= 0 ? 'appointments.pick_service_first' : 'booking.pick_doctor_first',
              )}
            </span>
          ) : slotsLoading ? (
            <span className={styles.subtitle}>{t('common.loading')}</span>
          ) : cells.length === 0 ? (
            <span className={styles.subtitle}>
              {availability?.workHoursConfigured === false
                ? t('appointments.work_hours_not_configured')
                : t('appointments.no_slots')}
            </span>
          ) : (
            <>
              {freeSlots.length === 0 && (
                <span className={styles.subtitle}>{t('appointments.no_slots')}</span>
              )}
              {morning.length > 0 && (
                <div className={styles.group}>
                  <span className={styles.groupLabel}>{t('booking.morning')}</span>
                  <div className={styles.chips}>{morning.map(slotButton)}</div>
                </div>
              )}
              {afternoon.length > 0 && (
                <div className={styles.group}>
                  <span className={styles.groupLabel}>{t('booking.afternoon')}</span>
                  <div className={styles.chips}>{afternoon.map(slotButton)}</div>
                </div>
              )}
            </>
          )}

          {lateLab != null && lateLab.expectedDate != null && (
            <div role="note" className={styles.note}>
              <AlertTriangle size={20} aria-hidden />
              <span>
                {t('booking.lab_warning', {
                  lab: lateLab.labName,
                  date: dateLabel(lateLab.expectedDate),
                })}
              </span>
            </div>
          )}

          <div className={styles.preview}>
            <b>{t('booking.reminder_title')}</b>
            <span className={styles.previewText}>
              {slotPicked && selectedPatient != null && form.values.startTime
                ? t('booking.reminder_text', {
                    name: selectedPatient.fullName.split(' ')[0],
                    date: slotDateLabel,
                    time: slotTimeLabel(form.values.startTime),
                    doctor: selectedDoctor ?? '',
                    branch: branchName,
                  })
                : t('booking.reminder_empty')}
            </span>
          </div>
        </section>
      </div>

      <div className={styles.bar}>
        <span className={styles.summary}>
          {slotPicked && selectedPatient != null && form.values.startTime ? (
            <>
              <b>{selectedPatient.fullName}</b> · {selectedDoctor} ·{' '}
              <b>
                {slotDateLabel} {slotTimeLabel(form.values.startTime)}
                {form.values.endTime ? `–${slotTimeLabel(form.values.endTime)}` : ''}
              </b>
            </>
          ) : (
            t('booking.summary_empty')
          )}
        </span>
        {error != null && (
          <span role="alert" className={styles.error}>
            {error}
          </span>
        )}
        <Button variant="default" onClick={onClose}>
          {t('booking.cancel')}
        </Button>
        <Button variant="primary" disabled={createMut.isPending || !slotPicked} onClick={submit}>
          {t('booking.submit')}
        </Button>
      </div>
    </div>
  );
}
