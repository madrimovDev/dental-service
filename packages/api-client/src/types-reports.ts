export type RevenueReport = {
  total: number;
  byBranch: Array<{ branchId: string; total: number }>;
  byService: Array<{ serviceName: string; total: number }>;
  byDoctor: Array<{ doctorId: string | null; total: number }>;
  byPeriod: Array<{ date: string; total: number }>;
};

export type AppointmentStatsReport = {
  total: number;
  byStatus: Array<{ status: string; count: number }>;
  noShowRate: number;
  slotUtilization: number;
};

export type DoctorWorkloadRow = { doctorId: string; total: number; completed: number };

export type PlanCompletionReport = {
  totalStages: number;
  completedStages: number;
  rate: number;
  byStatus: Array<{ status: string; count: number }>;
};
