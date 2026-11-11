import { getRecallSummary, listPatients } from '@dental/api-client';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useBranchAvailability, useDoctors } from '@/features/appointments/appointments.api.ts';
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
 * Bemor id → ism xaritasi (yozilish/navbat qatorlari uchun; ro'yxat DTO'sida patientName yo'q).
 * Server pagination: eng so'nggi 100 ta bemor — qolganlari «Bemor» deb ko'rinadi.
 */
export function usePatientNames() {
  const q = useQuery({
    queryKey: ['reception', 'patient-names'],
    queryFn: () => listPatients({ pageSize: 100 }).then((r) => r.data.data),
  });
  return useMemo(() => {
    const map = new Map<string, string>();
    for (const p of q.data ?? []) map.set(p.id, p.fullName);
    return map;
  }, [q.data]);
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
