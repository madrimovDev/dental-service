/**
 * Deterministik reminder job ID — yozilish bo'yicha. Bitta yozilishga bitta
 * eslatma: reschedule'da mavjud job topilib `changeDelay` qilinadi yoki
 * `remove`/`add`. add/remove drift qilmasligi uchun bitta joyda.
 *
 * Sof modul (Redis ulanishisiz) — `queue.ts` qayta eksport qiladi, test esa
 * shu yerdan import qiladi.
 */
// ⚠️ BullMQ 5.x maxsus jobId'da ':' ni rad etadi ("Custom Id cannot contain :",
// faqat aynan 3 qismli eski repeatable format istisno) — separator '-' bo'lishi
// shart, aks holda eslatma oynasidan uzoq yozilishlar 500 beradi.
// Regressiya: `reminder-job-id.test.ts` (real `Job.validateOptions`).
export const reminderJobId = (appointmentId: string) => `appointment-${appointmentId}`;
