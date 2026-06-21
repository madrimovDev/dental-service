/**
 * SMS shablon yordamchilari (server-side).
 *
 * Frontend `t()` bu yerda ishlamaydi (CLAUDE.md i18n qoidasi faqat web uchun) —
 * shuning uchun matnlar shu modulda literal `{ uz, ru }` sifatida saqlanadi.
 *
 * `renderReminderSms` — yozilish eslatmasi (CLI-186). `CLINIC_TZ` va
 * `formatClinicTime` qayta ishlatiladigan qilib ajratilgan: recall SMS (M10-B8)
 * formatter'ni ishlatadi, renderer'ni emas.
 */

/** Klinika vaqt zonasi — Asia/Tashkent (UTC+5, DST yo'q) — Qaror #22. */
export const CLINIC_TZ = 'Asia/Tashkent';

export type SmsLang = 'uz' | 'ru';

/**
 * UTC sana → klinika local vaqti "DD.MM.YYYY HH:mm" (Asia/Tashkent).
 * Barqaror numeric format — Intl locale ma'lumotiga (uz) tayanmaydi, faqat
 * `timeZone` va numeric qismlar ishlatiladi (web/audit.mappers bilan izchil).
 */
export function formatClinicTime(date: Date, tz: string = CLINIC_TZ): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '';

  return `${get('day')}.${get('month')}.${get('year')} ${get('hour')}:${get('minute')}`;
}

export type ReminderSmsInput = {
  lang: SmsLang;
  patientName: string;
  startTime: Date;
  tz?: string;
};

export type RenderedSms = {
  title: string;
  body: string;
};

/**
 * Yozilish eslatmasi SMS — uz/ru. `title` + `body` shakli `notifyInTx`
 * kontraktiga mos (SMS = `title — body`, in-app feed ham shu).
 */
export function renderReminderSms(input: ReminderSmsInput): RenderedSms {
  const tz = input.tz ?? CLINIC_TZ;
  const when = formatClinicTime(input.startTime, tz);
  const name = input.patientName.trim();

  if (input.lang === 'ru') {
    return {
      title: 'Напоминание о приёме',
      body: name ? `Пациент: ${name}, ${when}` : `Приём: ${when}`,
    };
  }
  // default: uz (Lotin)
  return {
    title: 'Yozilish eslatmasi',
    body: name ? `Bemor: ${name}, ${when}` : `Qabul: ${when}`,
  };
}
