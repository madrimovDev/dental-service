import type { CreateTimeOff, PutWorkingHours, WorkingHoursSegment } from '@dental/api-client';
import {
  createTimeOff,
  deleteTimeOff,
  getAvailability,
  getDoctorWorkingHours,
  listTimeOff,
  putDoctorWorkingHours,
} from '@dental/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { scheduleKeys } from './schedule.keys';

/** Doktor ish-soatlari (filial bo'yicha) — `schedule.view`. */
export function useWorkingHours(doctorId: string | null, branchId?: string | null) {
  return useQuery({
    queryKey: scheduleKeys.workingHours(doctorId ?? '', branchId ?? undefined),
    enabled: !!doctorId,
    queryFn: () =>
      getDoctorWorkingHours(doctorId as string, branchId ? { branchId } : undefined).then(
        (r) => r.data,
      ),
  });
}

/** Ish-soatlarini bulk-almashtirish — `schedule.manage`. */
export function useSaveWorkingHours() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      doctorId,
      branchId,
      segments,
    }: {
      doctorId: string;
      branchId: string;
      segments: WorkingHoursSegment[];
    }) => {
      const body: PutWorkingHours = { branchId, segments };
      return putDoctorWorkingHours(doctorId, body).then((r) => r.data);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: scheduleKeys.all }),
  });
}

/** Time-off ro'yxati — `schedule.view`. */
export function useTimeOff(params: {
  doctorId?: string;
  branchId?: string;
  from?: string;
  to?: string;
}) {
  return useQuery({
    queryKey: scheduleKeys.timeOff(params),
    enabled: !!params.doctorId,
    queryFn: () => listTimeOff(params).then((r) => r.data),
  });
}

/** Time-off yaratish — `schedule.manage`. */
export function useCreateTimeOff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateTimeOff) => createTimeOff(body).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: scheduleKeys.all }),
  });
}

/** Time-off o'chirish — `schedule.manage`. */
export function useDeleteTimeOff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteTimeOff(id).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: scheduleKeys.all }),
  });
}

/**
 * Doktor bo'sh slot'lari — `schedule.view`. To'rt parametr ham shart (doctorId,
 * branchId, date, slotMinutes>0); aks holda query o'chiriladi (`enabled`).
 */
export function useAvailability(params: {
  doctorId?: string | null;
  branchId?: string | null;
  date?: string | null;
  slotMinutes: number;
}) {
  const enabled = !!params.doctorId && !!params.branchId && !!params.date && params.slotMinutes > 0;
  return useQuery({
    queryKey: scheduleKeys.availability({
      doctorId: params.doctorId ?? '',
      branchId: params.branchId ?? '',
      date: params.date ?? '',
      slotMinutes: params.slotMinutes,
    }),
    enabled,
    queryFn: () =>
      getAvailability({
        doctorId: params.doctorId as string,
        branchId: params.branchId as string,
        date: params.date as string,
        slotMinutes: params.slotMinutes,
      }).then((r) => r.data),
  });
}
