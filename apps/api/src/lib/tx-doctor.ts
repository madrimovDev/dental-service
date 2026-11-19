import { cashierTransactions, treatmentPlans } from '@dental/db-schema';
import { sql } from 'drizzle-orm';

/**
 * FX-19 (LA-29, D-13): kassa tranzaksiyasining daromad egasi (doktor) — YAGONA manba
 * payroll `createRun`/`finalizeRun`, reports `byDoctor`/`ownerToday` va refund hook uchun:
 *
 *   COALESCE(treatment_plans.doctor_id, visit_notes.doctor_id)
 *
 * Vizit manbasi: tranzaksiyaning o'z `visit_note_id`si; refund qatori (u `visit_note_id`ni
 * ko'chirmaydi — «vizit to'langan» tekshiruvlari buzilmasin) uchun ASL (parent) tranzaksiyaniki.
 *
 * Chaqiruvchi so'rovda `treatment_plans`ni `cashier_transactions`ga LEFT JOIN qilgan bo'lishi
 * shart (shuning uchun ustunlar jadval nomi bilan to'liq-kvalifikatsiyalanadi).
 */
export const txDoctorId = sql<
  string | null
>`COALESCE(${treatmentPlans.doctorId}, (SELECT vn.doctor_id FROM visit_notes vn WHERE vn.id = COALESCE(${cashierTransactions.visitNoteId}, (SELECT pt.visit_note_id FROM cashier_transactions pt WHERE pt.id = ${cashierTransactions.parentTransactionId}))))`;
