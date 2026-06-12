import type { Database } from '../../../db/client.ts';
import { createDiagnosesRepository } from './diagnoses.repository.ts';

export const createDiagnosesService = (deps: { db: Database }) => {
  const repo = createDiagnosesRepository(deps);
  const list = (search?: string) => repo.list(search);
  return { list };
};

export type DiagnosesService = ReturnType<typeof createDiagnosesService>;
