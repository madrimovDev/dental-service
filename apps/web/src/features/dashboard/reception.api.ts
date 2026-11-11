import { ApiError, customInstance, getRecallSummary } from '@dental/api-client';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import i18n from 'i18next';
import { useBranchAvailability, useDoctors } from '@/features/appointments/appointments.api.ts';
import { usePatientNames as useClinicalPatientNames } from '@/features/clinical/clinical.api.ts';
import { usePatients } from '@/features/patients/patients.api.ts';
import { useAuthStore } from '@/stores/auth-store.ts';
import { useActiveLabOrders } from './dashboard.api.ts';
import { isLabOverdue } from './reception.logic.ts';

const localIsoDate = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Shifokorlar (id → ism) — filtr + «jadvalsiz shifokor» nomlari. `appointment.view` yetarli. */
export function useDoctorOptions() {
  return useDoctors();
}

/**
 * Bemor id → ism xaritasi: faqat bugungi yozilish/navbat qatorlaridagi NOYOB patientId'lar uchun
 * `getPatient` (cached + deduped) — bemorlar soni bo'yicha qattiq limit yo'q.
 */
export function usePatientNames(ids: Array<string | null | undefined>): Map<string, string> {
  const { hasPermission } = useAuthStore();
  return useClinicalPatientNames(
    ids.filter((id): id is string => !!id),
    hasPermission('patient.view'),
  );
}

/** Qidiruv (A.1 endpoint: kirill/lotin + istalgan telefon formati) — kamida 2 belgi. */
export function usePatientSearch(search: string) {
  return usePatients({ search, page: 1, pageSize: 5 }, { enabled: search.trim().length >= 2 });
}

/**
 * «Diqqat» manbalari — mavjud endpoint'lardan, har biri o'z ruxsati bilan gate (403 portlamasin):
 * jadvalsiz shifokor (P10: bugun filial availability'sida yo'q doktor), lab muddati o'tgan,
 * recall muddati o'tgan.
 */
export function useReceptionAttention(branchId: string | null) {
  const { hasPermission } = useAuthStore();
  const doctors = useDoctors();
  const availability = useBranchAvailability({
    branchId,
    date: localIsoDate(),
    enabled: hasPermission('schedule.view'),
  });
  const labs = useActiveLabOrders();
  const canRecall = hasPermission('recall.view');
  const recall = useQuery({
    queryKey: ['reception', 'recall-summary', branchId],
    queryFn: () => getRecallSummary({ branchId: branchId ?? undefined }).then((r) => r.data),
    enabled: canRecall,
  });

  const withSchedule = new Set((availability.data?.doctors ?? []).map((d) => d.doctorId));
  const doctorsWithoutSchedule = availability.data
    ? (doctors.data ?? []).filter((d) => !withSchedule.has(d.id))
    : [];
  const today = localIsoDate();
  const overdueLabs = (labs.data ?? []).filter((o) => isLabOverdue(o, today)).length;
  const recallOverdue = canRecall ? (recall.data?.overdue ?? 0) : 0;
  return { doctorsWithoutSchedule, overdueLabs, recallOverdue };
}

// ─── Telegram bron so'rovlari (UI-T2) ───────────────────────────────────────────
// TODO(integratsiya): generate:contract'dan keyin generated client'ga (listBookingRequests,
// confirmBookingRequest, declineBookingRequest) o'tkazish — hozircha customInstance + qo'lda tip.

export interface BookingRequestRow {
  id: string;
  status: 'pending' | 'confirmed' | 'declined' | 'expired';
  requestedStart: string;
  createdAt: string;
  branchId: string;
  branchName: string | null;
  patientId: string;
  patientName: string | null;
  doctorId: string | null;
  doctorName: string | null;
  rescheduleOfAppointmentId: string | null;
  appointmentId: string | null;
  declineReason: string | null;
}

export interface BookingRequestList {
  items: BookingRequestRow[];
  pendingCount: number;
}

const BOOKING_KEY = ['reception', 'booking-requests'] as const;

type Envelope<T> = { success: boolean; data: T };

/** `appointment.view` bilan GET; ruxsatsiz rolda so'rov yuborilmaydi (403 portlamasin). */
export function useBookingRequests() {
  const { hasPermission } = useAuthStore();
  return useQuery({
    queryKey: BOOKING_KEY,
    queryFn: () =>
      customInstance<Envelope<BookingRequestList>>({
        url: '/api/booking-requests',
        method: 'GET',
        params: { status: 'pending' },
      }).then((r) => r.data),
    enabled: hasPermission('appointment.view'),
  });
}

/** Slot band bo'lsa 409 — so'rov `pending` qoladi: aniq xabar, ro'yxat qayta yuklanadi. */
export function useConfirmBookingRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string }) =>
      customInstance<Envelope<unknown>>({
        url: `/api/booking-requests/${id}/confirm`,
        method: 'POST',
        data: {},
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: BOOKING_KEY });
      void qc.invalidateQueries({ queryKey: ['appointments'] });
    },
    onError: (e) => {
      const conflict = e instanceof ApiError && e.status === 409;
      notifications.show({
        color: 'red',
        message: i18n.t(conflict ? 'telegramRequests.confirm_conflict' : 'common.error'),
      });
      void qc.invalidateQueries({ queryKey: BOOKING_KEY });
    },
  });
}

export function useDeclineBookingRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      customInstance<Envelope<unknown>>({
        url: `/api/booking-requests/${id}/decline`,
        method: 'POST',
        data: { reason },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: BOOKING_KEY });
    },
  });
}
