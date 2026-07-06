import { z } from 'zod';

export const serviceCategoryFormSchema = z.object({
  name: z.string().min(1).max(100),
  nameRu: z.string().max(100),
});
