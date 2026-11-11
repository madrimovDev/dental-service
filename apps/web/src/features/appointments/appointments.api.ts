import type { CreateAppointmentBody } from '@dental/api-client';
import {
  cancelAppointment,
  createAppointment,
  getBookingContext,
  getBranchAvailability,
  listAppointments,
  listBranches,
  listDoctors,
  listServices,
  updateAppointment,
} from '@dental/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { scheduleKeys } from '@/features/schedule/schedule.keys';
import { lookupKeys } from '@/lib/lookup-keys';
import { appointmentKeys } from './appointments.keys';
import type { Appointment, AppointmentStatus } from './appointments.types';

/** Server sahifa hajmi (API `.max(100)`); kun/hafta oralig'i sahifalab TO'LIQ olinadi (SC-02). */
const PAGE_SIZE = 100;
/** Xavfsizlik chegarasi (30 × 100 = 3000 yozilish) — cheksiz sikldan himoya. */
const MAX_PAGES = 30;

/**
 * Berilgan oraliqdagi BARCHA yozilishlar. Avval faqat birinchi sahifa (100 ta)
 * olinardi va ortig'i jim kesilardi (SC-02). Server tartibi barqaror
 * (startTime, id) — sahifalar takrorlanmaydi.
 */
export function useAppointments(range: { branchId?: string; from: string; to: string }) {
  return useQuery({
    queryKey: appointmentKeys.list(range),
    queryFn: async (): Promise<Appointment[]> => {
      const all: Appointment[] = [];
      for (let page = 1; page <= MAX_PAGES; page++) {
        const rows = (await listAppointments({
          branchId: range.branchId,
          from: range.from,
          to: range.to,
          page,
          pageSize: PAGE_SIZE,
        }).then((r) => r.data)) as Appointment[];
        all.push(...rows);
        if (rows.length < PAGE_SIZE) break;
      }
      return all;
    },
  });
}

/**
 * Yozilish uchun doktorlar — yengil `GET /appointments/doctors` (`appointment.view`).
 * Avval `GET /users/assignments` (`user.view`) ishlatilardi — Receptionist'da o'sha
 * ruxsat yo'q → 403 → dropdown bo'sh edi (CLI-154). Backend allaqachon `{id, name}`
 * qaytaradi (doctor-rolli, dedupe).
 */
export function useDoctors() {
  return useQuery({
    queryKey: appointmentKeys.doctors(),
    queryFn: () => listDoctors().then((r) => r.data),
  });
}

/** Branch xizmatlari ro'yxati (MultiSelect opsiyalari uchun). */
export function useServices() {
  return useQuery({
    queryKey: lookupKeys.services(),
    queryFn: () => listServices().then((r) => r.data),
  });
}

/** Tenant filiallari (branch filter Select uchun). */
export function useBranches() {
  return useQuery({
    queryKey: lookupKeys.branches(),
    queryFn: () => listBranches().then((r) => r.data),
  });
}

/**
 * Filial bo'sh slotlari — `GET /schedule/availability/branch` (DS12 regen,
 * `schedule.view`). Right-rail "Bo'sh slot" kartasi uchun: tanlangan kun +
 * filialdagi barcha doktorlarning bo'sh oynalari. `slotMinutes` jo'natilmaydi
 * (backend default). `enabled` — filial tanlangan VA chaqiruvchi `schedule.view`
 * ruxsatiga ega bo'lganda (gating CalendarScreen'da, 403 oldini olish — CLI-153).
 */
export function useBranchAvailability(params: {
  branchId: string | null;
  date: string;
  enabled: boolean;
}) {
  const enabled = params.enabled && !!params.branchId;
  return useQuery({
    queryKey: appointmentKeys.branchAvailability({
      branchId: params.branchId ?? '',
      date: params.date,
    }),
    enabled,
    queryFn: () =>
      getBranchAvailability({ branchId: params.branchId as string, date: params.date }).then(
        (r) => r.data,
      ),
  });
}

/**
 * A12 (CLI-438): `appointmentKeys.all` allaqachon `appointmentKeys.branchAvailability`ni
 * (bir xil `['appointments', ...]` prefiks) qamrab oladi, lekin `scheduleKeys.availability`
 * (NewAppointmentWizard `useAvailability` — mustaqil `['schedule', ...]` prefiks) EMAS.
 * Shuning uchun ikkalasi ham invalidate qilinadi — aks holda bron/bekor qilingandan
 * keyin `useAvailability` `staleTime` davomida eski (bo'sh/band) slotni ko'rsatadi.
 */
function invalidateAppointmentAndAvailability(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: appointmentKeys.all });
  void qc.invalidateQueries({ queryKey: scheduleKeys.all });
}

export function useCreateAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateAppointmentBody) => createAppointment(body).then((r) => r.data),
    onSuccess: () => invalidateAppointmentAndAvailability(qc),
  });
}

export function useCancelAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      cancelAppointment(id, reason !== undefined ? { reason } : undefined).then((r) => r.data),
    onSuccess: () => invalidateAppointmentAndAvailability(qc),
  });
}

/** Faqat holat o'tishi (`PATCH /appointments/:id`, `appointment.edit`; state-machine serverda). */
export function useUpdateAppointmentStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: AppointmentStatus }) =>
      updateAppointment(id, { status }).then((r) => r.data),
    onSuccess: () => invalidateAppointmentAndAvailability(qc),
  });
}

/**
 * UI-R3: bemorning ochiq lab buyurtmalari (muddat ogohlantirishi) + faol reja bosqichi
 * (taklif). `appointment.create` — registratorda `lab_order.view` yo'q, shuning uchun tor endpoint.
 */
export function useBookingContext(patientId: string | null) {
  return useQuery({
    queryKey: appointmentKeys.bookingContext(patientId ?? ''),
    enabled: !!patientId,
    queryFn: () => getBookingContext({ patientId: patientId ?? '' }).then((r) => r.data),
  });
}
