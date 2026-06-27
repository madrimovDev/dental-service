import {
  type CreateLabOrderInput,
  type CreatePrescriptionInput,
  type CreateTemplateInput,
  type CreateToothChartInput,
  type CreateTreatmentPlanInput,
  type CreateVisitNoteInput,
  createConsentTemplate,
  createLabOrder,
  createPrescription,
  createToothChart,
  createTreatmentPlan,
  createVisitNote,
  deletePatientImage,
  getLatestToothChart,
  getPatient,
  getService,
  getTreatmentPlanEstimate,
  type LabOrderStatus,
  type ListLabOrdersParams,
  type ListTreatmentPlansParams,
  listAppointments,
  listConsentForms,
  listConsentTemplates,
  listDiagnoses,
  listLabOrders,
  listPatientImages,
  listPrescriptions,
  listServices,
  listToothCharts,
  listTreatmentPlans,
  listVisitNotes,
  type ServiceWithPrices,
  type SignFormInput,
  type SignTreatmentPlanConsentBody,
  signConsentForm,
  signTreatmentPlanConsent,
  type TreatmentStageAcceptance,
  type TreatmentStageStatus,
  type UpdateTreatmentPlanBodyStatus,
  updateLabOrder,
  updateTreatmentPlan,
  updateTreatmentStage,
} from '@dental/api-client';
import {
  type QueryClient,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { cashierKeys } from '@/features/cashier/cashier.keys.ts';
import { patientKeys } from '@/features/patients/patients.keys.ts';
import { api } from '@/lib/api.ts';
import { lookupKeys } from '@/lib/lookup-keys.ts';
import { clinicalKeys } from './clinical.keys';

const HOUR = 1000 * 60 * 60;

// ===== DS7: tenant-wide list patient-ism hal qilish =====
/**
 * Tenant-wide ro'yxatlarda bemor ismini hal qiladi. Backend list javobi faqat
 * `patientId` beradi → joriy sahifadagi NOYOB id'lar uchun `getPatient` (cached +
 * deduped, sahifa hajmi bilan chegaralangan; boshqa sahifalarni qamramaydi).
 * `patient.view` YO'Q rollar uchun `enabled=false` → 403 bo'lmaydi, cell id-fallback'ga
 * tushadi. `patientKeys.raw` keshini patients feature bilan bo'lishadi (qayta so'rovsiz).
 */
export function usePatientNames(ids: string[], enabled: boolean): Map<string, string> {
  const unique = Array.from(new Set(ids));
  const results = useQueries({
    queries: unique.map((id) => ({
      queryKey: patientKeys.raw(id),
      queryFn: () => getPatient(id).then((r) => r.data),
      enabled: enabled && !!id,
      staleTime: HOUR,
    })),
  });
  const map = new Map<string, string>();
  unique.forEach((id, i) => {
    const name = results[i]?.data?.fullName;
    if (name) map.set(id, name);
  });
  return map;
}

// ===== A: odontogram =====
export function useLatestToothChart(patientId: string) {
  return useQuery({
    queryKey: clinicalKeys.toothChartLatest(patientId),
    queryFn: () => getLatestToothChart(patientId).then((r) => r.data),
  });
}

// CLI-191: barcha snapshot'lar (states bilan) — tarix ko'rgichi uchun.
export function useToothChartHistory(patientId: string) {
  return useQuery({
    queryKey: clinicalKeys.toothCharts(patientId),
    queryFn: () => listToothCharts(patientId).then((r) => r.data),
  });
}

export function useCreateToothChart(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateToothChartInput) => createToothChart(body).then((r) => r.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: clinicalKeys.toothChartLatest(patientId) });
      void qc.invalidateQueries({ queryKey: clinicalKeys.toothCharts(patientId) });
    },
  });
}

// ===== A: treatment plans =====
export function useTreatmentPlans(patientId: string) {
  return useQuery({
    queryKey: clinicalKeys.plans(patientId),
    // DS7: list javobi endi `{ data, meta }` (paginated) — bemor tab'i faqat qatorlarni ko'rsatadi.
    queryFn: () => listTreatmentPlans({ patientId }).then((r) => r.data.data),
  });
}

/**
 * DS7: tenant-wide davolash rejalari (barcha bemorlar). `status` server-side filtr,
 * pagination `meta` orqali. Javob `{ data, meta }` (paginated envelope).
 */
export function useTreatmentPlansList(params: ListTreatmentPlansParams) {
  return useQuery({
    queryKey: clinicalKeys.plansList(params),
    queryFn: () => listTreatmentPlans(params).then((r) => r.data),
  });
}

export function useCreatePlan(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateTreatmentPlanInput) => createTreatmentPlan(body).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: clinicalKeys.plans(patientId) }),
  });
}

// CLI-188: davolash reja bosqichi uchun xizmat katalogi (lookup — cache bo'lishiladi).
export function useServiceCatalog() {
  return useQuery({
    queryKey: lookupKeys.services(),
    queryFn: () => listServices().then((r) => r.data),
    staleTime: HOUR,
  });
}

/**
 * Xizmat narxini imperativ (one-shot) oladi — bosqichga xizmat tanlanganda
 * cost'ni avto-to'ldirish uchun. Detail prices cache'lanadi.
 */
export function fetchServicePrices(qc: QueryClient, id: string): Promise<ServiceWithPrices> {
  return qc.fetchQuery({
    queryKey: ['services', 'detail', id],
    queryFn: () => getService(id).then((r) => r.data),
  });
}

export function useUpdateStage(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: TreatmentStageStatus }) =>
      updateTreatmentStage(id, { status }).then((r) => r.data),
    onSuccess: () => invalidatePlanFinancials(qc, patientId),
  });
}

// CLI-223/224: smeta (estimate) — bemorga taqdim qilish + balans yakuniy manbasi.
export function useTreatmentPlanEstimate(planId: string, enabled = true) {
  return useQuery({
    queryKey: clinicalKeys.planEstimate(planId),
    queryFn: () => getTreatmentPlanEstimate(planId).then((r) => r.data),
    enabled,
  });
}

/**
 * CLI-224: bosqich qabul/rad qilish (acceptance — status'dan alohida o'q).
 * Qabul qilingach bosqich qarzga kiradi (Qaror #24/#25) → smeta + balanslarni yangilaymiz.
 * Plan-estimate keshini ham bekor qilamiz; planId stage javobidan olinadi.
 */
export function useUpdateStageAcceptance(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, acceptance }: { id: string; acceptance: TreatmentStageAcceptance }) =>
      updateTreatmentStage(id, { acceptance }).then((r) => r.data),
    onSuccess: (stage) => {
      invalidatePlanFinancials(qc, patientId);
      void qc.invalidateQueries({ queryKey: clinicalKeys.planEstimate(stage.treatmentPlanId) });
    },
  });
}

/**
 * CLI-224: "Hammasini qabul qilish" — keng tarqalgan holat (bemor butun rejaga rozi).
 * Faqat `proposed` bosqichlar yuboriladi (guard 400 oldini olish). allSettled — qisman
 * muvaffaqiyat ham bekor qilishni triggerlaydi; chaqiruvchi rad etilganlarni xabar beradi.
 */
export function useAcceptAllStages(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (stageIds: string[]) => {
      const results = await Promise.allSettled(
        stageIds.map((id) => updateTreatmentStage(id, { acceptance: 'accepted' })),
      );
      const rejected = results.filter((r) => r.status === 'rejected').length;
      // planId — fulfilled javobdan (barcha stage bitta rejaga tegishli).
      const fulfilled = results.find((r) => r.status === 'fulfilled');
      const planId =
        fulfilled?.status === 'fulfilled' ? fulfilled.value.data.treatmentPlanId : null;
      return { total: stageIds.length, rejected, planId };
    },
    onSuccess: ({ planId }) => {
      invalidatePlanFinancials(qc, patientId);
      if (planId) void qc.invalidateQueries({ queryKey: clinicalKeys.planEstimate(planId) });
    },
  });
}

/** CLI-224: reja status o'tishi (presented/accepted/...); accept consent'ga bog'liq (guard 400). */
export function useUpdatePlanStatus(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: UpdateTreatmentPlanBodyStatus }) =>
      updateTreatmentPlan(id, { status }).then((r) => r.data),
    onSuccess: () => invalidatePlanFinancials(qc, patientId),
  });
}

/** CLI-224: reja rozilik (consent) imzosi — present→accept'ni ochadi. */
export function useSignPlanConsent(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: SignTreatmentPlanConsentBody }) =>
      signTreatmentPlanConsent(id, body).then((r) => r.data),
    onSuccess: () => invalidatePlanFinancials(qc, patientId),
  });
}

/**
 * Reja moliyaviy ko'rinishini bekor qiladi: plan list (stage'lar nested) + bemor balansi
 * (boshqa feature, faqat kalit massivi → scope'da) + kassa reja balansi.
 */
function invalidatePlanFinancials(qc: QueryClient, patientId: string) {
  void qc.invalidateQueries({ queryKey: clinicalKeys.plans(patientId) });
  void qc.invalidateQueries({ queryKey: patientKeys.balance(patientId) });
  void qc.invalidateQueries({ queryKey: cashierKeys.all });
}

// ===== A: visit notes =====
export function useVisitNotes(patientId: string) {
  return useQuery({
    queryKey: clinicalKeys.visitNotes(patientId),
    queryFn: () => listVisitNotes({ patientId }).then((r) => r.data),
  });
}

export function useCreateVisitNote(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateVisitNoteInput) => createVisitNote(body).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: clinicalKeys.visitNotes(patientId) }),
  });
}

export function useDiagnoses() {
  return useQuery({
    queryKey: clinicalKeys.diagnoses(),
    queryFn: () => listDiagnoses().then((r) => r.data),
    staleTime: HOUR,
  });
}

export function usePatientAppointments(patientId: string) {
  return useQuery({
    queryKey: clinicalKeys.appointmentsForPatient(patientId),
    queryFn: () => listAppointments({ patientId }).then((r) => r.data),
  });
}

// ===== B: prescriptions =====
export function usePrescriptions(patientId: string) {
  return useQuery({
    queryKey: clinicalKeys.prescriptions(patientId),
    queryFn: () => listPrescriptions({ patientId }).then((r) => r.data),
  });
}

export function useCreatePrescription(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreatePrescriptionInput) => createPrescription(body).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: clinicalKeys.prescriptions(patientId) }),
  });
}

// ===== B: lab orders =====
export function useLabOrders(patientId: string) {
  return useQuery({
    queryKey: clinicalKeys.labOrders(patientId),
    // DS7: list javobi endi `{ data, meta }` (paginated).
    queryFn: () => listLabOrders({ patientId }).then((r) => r.data.data),
  });
}

/**
 * DS7: tenant-wide laboratoriya buyurtmalari (barcha bemorlar). `status` server-side
 * filtr, pagination `meta` orqali. Javob `{ data, meta }`.
 */
export function useLabOrdersList(params: ListLabOrdersParams) {
  return useQuery({
    queryKey: clinicalKeys.labOrdersList(params),
    queryFn: () => listLabOrders(params).then((r) => r.data),
  });
}

export function useCreateLabOrder(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateLabOrderInput) => createLabOrder(body).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: clinicalKeys.labOrders(patientId) }),
  });
}

export function useUpdateLabOrderStatus(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: LabOrderStatus }) =>
      updateLabOrder(id, { status }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: clinicalKeys.labOrders(patientId) }),
  });
}

// ===== B: consent =====
export function useConsentForms(patientId: string) {
  return useQuery({
    queryKey: clinicalKeys.consentForms(patientId),
    queryFn: () => listConsentForms({ patientId }).then((r) => r.data),
  });
}

export function useConsentTemplates() {
  return useQuery({
    queryKey: clinicalKeys.consentTemplates(),
    queryFn: () => listConsentTemplates().then((r) => r.data),
  });
}

export function useSignConsent(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SignFormInput) => signConsentForm(body).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: clinicalKeys.consentForms(patientId) }),
  });
}

export function useCreateConsentTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateTemplateInput) => createConsentTemplate(body).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: clinicalKeys.consentTemplates() }),
  });
}

// ===== C: images =====
export function usePatientImages(patientId: string, visitNoteId?: string) {
  return useQuery({
    queryKey: clinicalKeys.images(patientId, visitNoteId),
    queryFn: () =>
      listPatientImages(patientId, visitNoteId ? { visitNoteId } : undefined).then((r) => r.data),
  });
}

export function useUploadPatientImage(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (form: FormData) => api.patientImages.upload(form),
    // Prefiks bo'yicha invalidatsiya — barcha (filtered/all) image query'lari.
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clinical', 'images', patientId] }),
  });
}

export function useDeletePatientImage(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deletePatientImage(id).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clinical', 'images', patientId] }),
  });
}
