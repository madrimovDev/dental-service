import { describe, expect, test } from 'bun:test';
import { Job } from 'bullmq';
import { reminderJobId } from './reminder-job-id.ts';

// BullMQ `Queue.add` jobId'ni `Job.validateOptions`da tekshiradi (Redis'ga
// murojaat qilmasdan). Ilgari `appointment:<uuid>` edi — `:` bo'yicha 2 qismga
// bo'linadi (3 emas) → "Custom Id cannot contain :" → eslatma oynasidan uzoq
// har yozilish 500 berardi. CLI-186 testlari `enqueueReminder`ni spy bilan
// almashtirgani uchun bu hech qachon ushlanmagan — shu test real BullMQ
// validatsiyasini chaqiradi.
// `validateOptions` protected — testda prototipdan to'g'ridan chaqiriladi.
type ValidateFn = (this: unknown, jobData: unknown) => void;
const validateOptions = (Job.prototype as unknown as { validateOptions: ValidateFn })
  .validateOptions;
const validate = (jobId: string) =>
  validateOptions.call(
    { name: 'appointment-reminder', opts: { jobId, delay: 60_000 } },
    { data: '{}' },
  );

describe('reminderJobId', () => {
  const uuid = '3bca0927-4668-4ba7-8334-9b082015802d';

  test("BullMQ jobId validatsiyasidan o'tadi", () => {
    expect(() => validate(reminderJobId(uuid))).not.toThrow();
  });

  test('deterministik — bir yozilishga bitta id', () => {
    expect(reminderJobId(uuid)).toBe(reminderJobId(uuid));
  });

  test("regressiya qo'riqchisi: eski `appointment:<uuid>` formati BullMQ tomonidan rad etiladi", () => {
    expect(() => validate(`appointment:${uuid}`)).toThrow('Custom Id cannot contain :');
  });
});
