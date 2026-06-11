import type { Service } from '@dental/api-client';

/** Bitta xizmat qatorining view-model'i (jadval uchun). */
export type ServiceVM = {
  id: string;
  code: string;
  nameUz: string;
  nameRu: string | null;
  category: string | null;
  durationMinutes: number;
  isActive: boolean;
};

/**
 * Kategoriya guruhi. `category` xom kalit (null = kategoriyasiz);
 * ko'rsatiladigan label komponentda t() bilan tarjima qilinadi.
 */
export type CategoryGroup = {
  category: string | null;
  services: ServiceVM[];
};

/** Forma qiymatlari (Zod schema bilan moslashadi — services.schema.ts). */
export type ServiceFormValues = {
  code: string;
  nameUz: string;
  nameRu: string;
  category: string;
  durationMinutes: number;
  requiredRole: string;
  descriptionUz: string;
  descriptionRu: string;
  isActive: boolean;
  initialBranchId?: string;
  initialPrice?: number;
};
