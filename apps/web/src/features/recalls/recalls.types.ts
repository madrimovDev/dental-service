import type {
  CreateRecall,
  RecallDto,
  RecallDtoReason,
  RecallDtoStatus,
  UpdateRecall,
} from '@dental/api-client';

export type { CreateRecall, RecallDto, RecallDtoReason, RecallDtoStatus, UpdateRecall };

/** Recall ro'yxati so'rovi parametrlari (dashboard + bemor filtri uchun). */
export type RecallListParams = {
  date?: string;
  status?: RecallDtoStatus;
  branchId?: string;
};
