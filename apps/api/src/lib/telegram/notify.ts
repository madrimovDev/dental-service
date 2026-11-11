import type { PrescriptionItem } from '@dental/db-schema';
import { patients, tenantSettings, tenants } from '@dental/db-schema';
import type { NotificationChannel } from '@dental/notifications';
import { eq } from 'drizzle-orm';
import type { DbOrTx } from '../../db/client.ts';
import { withTenant as defaultWithTenant } from '../../db/scoped.ts';
import { logger } from '../logger.ts';
import { resolveTenantChannel } from '../tenant-channel.ts';
import { type BotLang, botMessages, fmtWhen, toBotLang } from './messages.ts';
import type { BotReply } from './reply.ts';

type WithTenant = <T>(tenantId: string, fn: (tx: DbOrTx) => Promise<T>) => Promise<T>;

export type PatientMessenger = {
  sendReceipt: (a: {
    tenantId: string;
    patientId: string;
    amount: number | string;
    at: Date;
    receiptNumber: string | null;
  }) => Promise<void>;
  sendPrescription: (a: {
    tenantId: string;
    patientId: string;
    issuedAt: Date;
    items: PrescriptionItem[];
  }) => Promise<void>;
  sendBookingDecision: (a: {
    tenantId: string;
    patientId: string;
    decision: 'confirmed' | 'declined';
    start: Date;
    reason?: string | null;
  }) => Promise<void>;
};

export type MessengerDeps = {
  withTenant?: WithTenant;
  /** Test/DI: kanal tanlovini almashtirish (default — `resolveTenantChannel`). */
  resolveChannel?: typeof resolveTenantChannel;
};

const fmtMoney = (amount: number | string, lang: BotLang): string => {
  const n = Number(amount);
  const s = Number.isFinite(n) ? n.toLocaleString('ru-RU') : String(amount);
  return `${s} ${lang === 'ru' ? 'сум' : 'so‘m'}`;
};

/**
 * Bemorga Telegram orqali xabar (PII minimal). FAQAT bog'langan (telegram_chat_id)
 * bemorga VA tenantning bot tokeni sozlangan bo'lsa yuboriladi; aks holda jim
 * o'tkaziladi (SMS'ga tushmaydi — bot funksiyasi). Xato throw qilmaydi (chaqiruvchi
 * `onAfterCommit` — javobni buzmasin).
 */
export function createPatientMessenger(deps: MessengerDeps = {}): PatientMessenger {
  const withTenant = deps.withTenant ?? defaultWithTenant;
  const resolve = deps.resolveChannel ?? resolveTenantChannel;

  async function sendToPatient(
    tenantId: string,
    patientId: string,
    render: (lang: BotLang) => BotReply,
  ): Promise<boolean> {
    try {
      const target = await withTenant(tenantId, async (tx) => {
        const [p] = await tx
          .select({ chat: patients.telegramChatId, pref: patients.preferredLanguage })
          .from(patients)
          .where(eq(patients.id, patientId))
          .limit(1);
        if (!p?.chat) return null;
        const [t] = await tx
          .select({ lang: tenants.defaultLanguage })
          .from(tenants)
          .where(eq(tenants.id, tenantId))
          .limit(1);
        const [s] = await tx
          .select({ i: tenantSettings.integrationSettings })
          .from(tenantSettings)
          .where(eq(tenantSettings.tenantId, tenantId))
          .limit(1);
        return {
          chat: p.chat,
          lang: toBotLang(p.pref, toBotLang(t?.lang)),
          settings: (s?.i ?? null) as Record<string, unknown> | null,
        };
      });
      if (!target) return false;
      const resolved = resolve(target.settings, target.chat, null);
      if (resolved.source !== 'telegram') return false;
      const reply = render(target.lang);
      const channel: NotificationChannel = resolved.channel;
      const res = await channel.send(
        target.chat,
        reply.buttons ? { text: reply.text, buttons: reply.buttons } : { text: reply.text },
      );
      return res.ok;
    } catch (err) {
      logger.warn({ err, tenantId }, 'patient telegram message failed');
      return false;
    }
  }

  return {
    async sendReceipt(a) {
      await sendToPatient(a.tenantId, a.patientId, (lang) => ({
        text: botMessages(lang).receipt({
          amount: fmtMoney(a.amount, lang),
          when: fmtWhen(a.at),
          receiptNumber: a.receiptNumber,
        }),
      }));
    },
    async sendPrescription(a) {
      await sendToPatient(a.tenantId, a.patientId, (lang) => ({
        text: botMessages(lang).prescription({
          when: fmtWhen(a.issuedAt),
          items: a.items.map((i) => ({
            name: i.medicationName,
            dosage: i.dosage,
            frequency: i.frequency,
            days: i.durationDays,
          })),
        }),
      }));
    },
    async sendBookingDecision(a) {
      await sendToPatient(a.tenantId, a.patientId, (lang) => {
        const m = botMessages(lang);
        return {
          text:
            a.decision === 'confirmed'
              ? m.requestConfirmed(fmtWhen(a.start))
              : m.requestDeclined(a.reason ?? null),
        };
      });
    },
  };
}
