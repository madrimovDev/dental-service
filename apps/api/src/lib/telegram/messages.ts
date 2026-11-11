/**
 * UI-T2 — Telegram bot matnlari (uz/ru). `packages/i18n` EMAS (u web uchun):
 * server-side literal lug'at, `sms-templates.ts` bilan bir xil yondashuv.
 */
import { formatClinicTime } from '../sms-templates.ts';

export type BotLang = 'uz' | 'ru';

export const toBotLang = (v: string | null | undefined, fallback: BotLang = 'uz'): BotLang =>
  v === 'ru' ? 'ru' : v === 'uz' ? 'uz' : fallback;

/** Anketa savollari (kalit — `medical_records.questionnaire_answers` JSON kaliti). */
export const QUESTIONNAIRE_KEYS = [
  'allergies',
  'chronic',
  'medications',
  'pregnancy',
  'anesthesia',
] as const;
export type QuestionnaireKey = (typeof QUESTIONNAIRE_KEYS)[number];
/** Homiladorlik savoli — ixtiyoriy (o'tkazib yuborish mumkin). */
export const OPTIONAL_QUESTION: QuestionnaireKey = 'pregnancy';

type Dict = {
  menuBook: string;
  menuQuestionnaire: string;
  menuLang: string;
  menuPrompt: string;
  notLinked: string;
  chooseBranch: string;
  chooseDoctor: string;
  anyDoctor: string;
  chooseDay: string;
  chooseSlot: string;
  noSlots: string;
  noBranches: string;
  back: string;
  cancelFlow: string;
  flowCancelled: string;
  sessionExpired: string;
  alreadyPending: string;
  requestSent: (when: string) => string;
  requestConfirmed: (when: string) => string;
  requestDeclined: (reason: string | null) => string;
  rescheduleSent: (when: string) => string;
  reminderYes: string;
  reminderOther: string;
  reminderCancel: string;
  reminderConfirmedReply: string;
  reminderCancelledReply: string;
  reminderAlready: string;
  notYours: string;
  notFound: string;
  questions: Record<QuestionnaireKey, string>;
  questionnaireIntro: string;
  skip: string;
  questionnaireDone: string;
  langPrompt: string;
  langSet: string;
  receipt: (p: { amount: string; when: string; receiptNumber: string | null }) => string;
  prescription: (p: {
    when: string;
    items: { name: string; dosage: string; frequency: string; days?: number }[];
  }) => string;
  slotTaken: string;
};

const uz: Dict = {
  menuBook: '📅 Yozilish',
  menuQuestionnaire: '📋 Anketa',
  menuLang: '🌐 Til',
  menuPrompt: 'Kerakli bo‘limni tanlang:',
  notLinked: 'Avval raqamingizni ulashing — /start',
  chooseBranch: 'Qaysi filialga yozilmoqchisiz?',
  chooseDoctor: 'Shifokorni tanlang:',
  anyDoctor: 'Farqi yo‘q',
  chooseDay: 'Qaysi kun qulay?',
  chooseSlot: 'Bo‘sh vaqtni tanlang:',
  noSlots: 'Bu kunga bo‘sh vaqt yo‘q. Boshqa kunni tanlang.',
  noBranches: 'Hozircha onlayn yozilish mavjud emas. Klinikaga murojaat qiling.',
  back: '⬅️ Orqaga',
  cancelFlow: '✖️ Bekor qilish',
  flowCancelled: 'Bekor qilindi.',
  sessionExpired: 'Suhbat eskirdi. Qaytadan boshlang.',
  alreadyPending: 'Sizning so‘rovingiz ko‘rib chiqilmoqda. Registrator javobini kuting.',
  requestSent: (when) =>
    `✅ So‘rov yuborildi: ${when}. Registrator tasdiqlagach, sizga xabar beramiz.`,
  requestConfirmed: (when) => `✅ Yozilishingiz tasdiqlandi: ${when}.`,
  requestDeclined: (reason) =>
    `❌ Afsuski, so‘rov rad etildi${reason ? ` (${reason})` : ''}. Boshqa vaqtni tanlab ko‘ring.`,
  rescheduleSent: (when) =>
    `✅ Boshqa vaqt so‘rovi yuborildi: ${when}. Registrator tasdiqlagach, xabar beramiz.`,
  reminderYes: '✅ Kelaman',
  reminderOther: '🕒 Boshqa vaqt',
  reminderCancel: '❌ Bekor',
  reminderConfirmedReply: '✅ Rahmat! Sizni kutamiz.',
  reminderCancelledReply: 'Yozilish bekor qilindi.',
  reminderAlready: 'Allaqachon qayd etildi.',
  notYours: 'Bu amal siz uchun mavjud emas.',
  notFound: 'Yozilish topilmadi.',
  questions: {
    allergies:
      'Allergiyangiz bormi (dori, anesteziya, lateks)? Bo‘lsa, yozing; yo‘q bo‘lsa — «yo‘q».',
    chronic: 'Surunkali kasalliklaringiz bormi (diabet, yurak, qon bosimi va h.k.)?',
    medications: 'Hozir qanday dorilar qabul qilyapsiz?',
    pregnancy: 'Homiladormisiz yoki emizikli davrdamisiz? (ixtiyoriy)',
    anesthesia: 'Oldin og‘riqsizlantirishga (ukol) salbiy reaksiya bo‘lganmi?',
  },
  questionnaireIntro:
    'Shifokor uchun qisqa anketa (5 ta savol). Javoblar tibbiy kartaga qoralama sifatida tushadi.',
  skip: '⏭ O‘tkazib yuborish',
  questionnaireDone: '✅ Rahmat! Javoblaringiz shifokorga yuborildi.',
  langPrompt: 'Tilni tanlang:',
  langSet: '✅ Til o‘zgartirildi.',
  receipt: ({ amount, when, receiptNumber }) =>
    `🧾 To‘lov qabul qilindi\nSumma: ${amount}\nSana: ${when}${receiptNumber ? `\nChek: ${receiptNumber}` : ''}`,
  prescription: ({ when, items }) =>
    `💊 Retsept (${when})\n${items
      .map((i) => `• ${i.name} — ${i.dosage}, ${i.frequency}${i.days ? `, ${i.days} kun` : ''}`)
      .join('\n')}`,
  slotTaken: 'Bu vaqt band bo‘lib qoldi. Boshqa vaqtni tanlang.',
};

const ru: Dict = {
  menuBook: '📅 Записаться',
  menuQuestionnaire: '📋 Анкета',
  menuLang: '🌐 Язык',
  menuPrompt: 'Выберите раздел:',
  notLinked: 'Сначала поделитесь номером — /start',
  chooseBranch: 'В какой филиал хотите записаться?',
  chooseDoctor: 'Выберите врача:',
  anyDoctor: 'Не важно',
  chooseDay: 'Какой день удобен?',
  chooseSlot: 'Выберите свободное время:',
  noSlots: 'На этот день нет свободного времени. Выберите другой день.',
  noBranches: 'Онлайн-запись пока недоступна. Обратитесь в клинику.',
  back: '⬅️ Назад',
  cancelFlow: '✖️ Отмена',
  flowCancelled: 'Отменено.',
  sessionExpired: 'Диалог устарел. Начните заново.',
  alreadyPending: 'Ваша заявка уже рассматривается. Дождитесь ответа регистратора.',
  requestSent: (when) => `✅ Заявка отправлена: ${when}. Мы сообщим, когда регистратор подтвердит.`,
  requestConfirmed: (when) => `✅ Ваша запись подтверждена: ${when}.`,
  requestDeclined: (reason) =>
    `❌ К сожалению, заявка отклонена${reason ? ` (${reason})` : ''}. Попробуйте выбрать другое время.`,
  rescheduleSent: (when) =>
    `✅ Заявка на другое время отправлена: ${when}. Мы сообщим, когда регистратор подтвердит.`,
  reminderYes: '✅ Приду',
  reminderOther: '🕒 Другое время',
  reminderCancel: '❌ Отменить',
  reminderConfirmedReply: '✅ Спасибо! Ждём вас.',
  reminderCancelledReply: 'Запись отменена.',
  reminderAlready: 'Уже учтено.',
  notYours: 'Это действие вам недоступно.',
  notFound: 'Запись не найдена.',
  questions: {
    allergies: 'Есть ли аллергия (лекарства, анестезия, латекс)? Если нет — напишите «нет».',
    chronic: 'Есть ли хронические заболевания (диабет, сердце, давление и т.д.)?',
    medications: 'Какие лекарства принимаете сейчас?',
    pregnancy: 'Беременны или кормите грудью? (необязательно)',
    anesthesia: 'Была ли ранее негативная реакция на обезболивание (укол)?',
  },
  questionnaireIntro:
    'Короткая анкета для врача (5 вопросов). Ответы попадут в медкарту как черновик.',
  skip: '⏭ Пропустить',
  questionnaireDone: '✅ Спасибо! Ваши ответы переданы врачу.',
  langPrompt: 'Выберите язык:',
  langSet: '✅ Язык изменён.',
  receipt: ({ amount, when, receiptNumber }) =>
    `🧾 Оплата принята\nСумма: ${amount}\nДата: ${when}${receiptNumber ? `\nЧек: ${receiptNumber}` : ''}`,
  prescription: ({ when, items }) =>
    `💊 Рецепт (${when})\n${items
      .map((i) => `• ${i.name} — ${i.dosage}, ${i.frequency}${i.days ? `, ${i.days} дн.` : ''}`)
      .join('\n')}`,
  slotTaken: 'Это время уже занято. Выберите другое.',
};

export const botMessages = (lang: BotLang): Dict => (lang === 'ru' ? ru : uz);

/** Klinika-local "DD.MM.YYYY HH:mm". */
export const fmtWhen = (d: Date): string => formatClinicTime(d);
