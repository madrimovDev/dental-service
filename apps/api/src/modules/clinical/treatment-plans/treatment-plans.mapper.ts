import type { treatmentPlans, treatmentStages } from '@dental/db-schema';

type PlanRow = typeof treatmentPlans.$inferSelect;
type StageRow = typeof treatmentStages.$inferSelect;

/** Hozirgi javob shakli: plan + stages. Mapping qo'shilmaydi (api-client invariant). */
export const toPlanDto = (plan: PlanRow & { stages: StageRow[] }) => plan;
export const toStageDto = (stage: StageRow) => stage;
