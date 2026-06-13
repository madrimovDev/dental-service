import {
  getAppointmentStatsReport,
  getDoctorWorkloadReport,
  getPlanCompletionReport,
  getRevenueReport,
  listAppointments,
  listBranches,
  listLabOrders,
  listUserAssignments,
} from '@dental/api-client';
import { useQuery } from '@tanstack/react-query';

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Bugungi (lokal) kun chegaralari — ISO datetime (kun boshi → kun oxiri).
 * appointments `from`/`to` `z.iso.datetime()` kutadi (date-only → 400), shu sabab
 * to'liq ISO datetime qaytariladi (CLI-160). Doctor/Receptionist/Assistant
 * dashboardlari shu oraliqni listAppointments'ga uzatadi.
 */
export function useTodayRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  return { from: start.toISOString(), to: end.toISOString() };
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

/** id→nom lookup'lar — dashboard'da UUID o'rniga nom ko'rsatish uchun (CLI-152). */
export function useBranchNames() {
  return useQuery({
    queryKey: ['dashboard', 'branch-names'],
    queryFn: () => listBranches().then((r) => r.data),
    select: (rows) => new Map(rows.map((b) => [b.id, b.name])),
  });
}

export function useDoctorNames() {
  return useQuery({
    queryKey: ['dashboard', 'doctor-names'],
    queryFn: () => listUserAssignments().then((r) => r.data),
    select: (rows) => new Map(rows.map((a) => [a.userId, a.userFullName ?? a.userPhone])),
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
