import {
  getAppointmentStatsReport,
  getDoctorWorkloadReport,
  getPlanCompletionReport,
  getRevenueReport,
  listAppointments,
  listLabOrders,
} from '@dental/api-client';
import { useQuery } from '@tanstack/react-query';

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

/** Bugungi (lokal) sana — `from`/`to` bir xil. */
export function useTodayRange() {
  const today = isoDate(new Date());
  return { from: today, to: today };
}

/** Oxirgi 30 kunlik oraliq (KPI bloklari uchun default). */
export function useDefaultPeriod() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 29);
  return { from: isoDate(from), to: isoDate(to) };
}

export interface KpiRange {
  from: string;
  to: string;
  branchId?: string;
}

/**
 * Menejer KPI bloki — reports.* endpointlarini parallel oladi.
 * Yangi backend endpoint qo'shilmaydi (api-client reports main'da mavjud).
 */
/** Faqat revenue hisoboti (Buxgalter — qolgan 3 KPI so'ralmaydi). */
export function useRevenueReport(range: KpiRange) {
  const q = { from: range.from, to: range.to, branchId: range.branchId };
  return useQuery({
    queryKey: ['dashboard', 'revenue', q],
    queryFn: () => getRevenueReport(q).then((r) => r.data),
  });
}

/** Joriy doktorning (doctorId) berilgan oraliqdagi qabullari. */
export function useDoctorAppointments(
  doctorId: string | undefined,
  branchId: string | null,
  range: { from: string; to: string },
) {
  return useQuery({
    queryKey: ['dashboard', 'doctor-appointments', doctorId, branchId, range],
    queryFn: () =>
      listAppointments({
        branchId: branchId ?? undefined,
        doctorId,
        from: range.from,
        to: range.to,
      }).then((r) => r.data),
    enabled: !!doctorId,
  });
}

/** Faol (delivered/cancelled bo'lmagan) lab buyurtmalari — texnik navbati. */
export function useActiveLabOrders() {
  return useQuery({
    queryKey: ['dashboard', 'lab-orders'],
    queryFn: () => listLabOrders().then((r) => r.data),
    select: (orders) => orders.filter((o) => o.status !== 'delivered' && o.status !== 'cancelled'),
  });
}

export function useManagerKpi(range: KpiRange) {
  const q = { from: range.from, to: range.to, branchId: range.branchId };
  const revenue = useQuery({
    queryKey: ['dashboard', 'manager-revenue', q],
    queryFn: () => getRevenueReport(q).then((r) => r.data),
  });
  const appointments = useQuery({
    queryKey: ['dashboard', 'manager-appointments', q],
    queryFn: () => getAppointmentStatsReport(q).then((r) => r.data),
  });
  const doctors = useQuery({
    queryKey: ['dashboard', 'manager-doctors', q],
    queryFn: () => getDoctorWorkloadReport(q).then((r) => r.data),
  });
  const treatmentPlans = useQuery({
    queryKey: ['dashboard', 'manager-plans', q],
    queryFn: () => getPlanCompletionReport(q).then((r) => r.data),
  });
  return { revenue, appointments, doctors, treatmentPlans };
}
