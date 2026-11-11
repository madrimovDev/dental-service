import { sql } from 'drizzle-orm';
import type { Database, Tx } from './client';

/**
 * RLS kontekstli tranzaksiyalar. `set_config(..., true)` = SET LOCAL —
 * faqat shu tranzaksiya ichida. Kontekstsiz so'rov RLS jadvallaridan 0 qator
 * oladi (siyosat NULL bilan solishtiradi).
 */
export const withLab = <T>(db: Database, labId: string, fn: (tx: Tx) => Promise<T>) =>
  db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.current_lab_id', ${labId}, true)`);
    return fn(tx);
  });

export const withClinic = <T>(db: Database, clinicId: string, fn: (tx: Tx) => Promise<T>) =>
  db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.current_clinic_id', ${clinicId}, true)`);
    return fn(tx);
  });

/** Login: faqat shu telefonli `lab_users` qatorini o'qish huquqi (lab hali noma'lum). */
export const withLoginPhone = <T>(db: Database, phone: string, fn: (tx: Tx) => Promise<T>) =>
  db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.login_phone', ${phone}, true)`);
    return fn(tx);
  });
