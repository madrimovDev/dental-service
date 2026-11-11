import { normalizePhone } from '@dental/core';
import { auditLog, phoneVerifications, users } from '@dental/db-schema';
import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import type { DbOrTx } from '../../db/client.ts';

/**
 * FU-15 — telefonni Telegram orqali tasdiqlash (bot tomoni). Telegraf'siz sof
 * funksiyalar: bot-manager ulaydi, integratsiya testi real DB'ga qarshi chaqiradi.
 *
 * `phone_verifications` va `users` — platforma jadvallari (RLS yo'q), shuning uchun
 * har qanday ulanish (bot'ning admin ulanishi yoki app roli) bilan bir xil ishlaydi.
 *
 * Xavfsizlik qoidalari:
 *  - token bazada faqat SHA-256 xesh ko'rinishida; deep-link'dagi ochiq qiymat qaytmaydi;
 *  - token faqat UNI CHIQARGAN klinika botida (`tenant_id`) va bitta chat'ga bog'lanadi;
 *  - kontakt faqat foydalanuvchining O'Z kontakti bo'lsa (`contact.user_id === from.id`,
 *    P8 bilan bir xil qoida) va raqam `users.phone` bilan kanonik mos kelsa qabul qilinadi;
 *  - noto'g'ri raqam tokenni yoqadi (qayta urinish uchun yangi havola kerak).
 */

/** `/start` payload prefiksi — bemor bog'lash oqimidan (P8) ajratadi. */
export const PV_START_PREFIX = 'pv_';

/** Telegram `contact.phone_number` (`+998…` yoki `998…`) → `+<raqamlar>`, mamlakat kodi taxmin qilinmaydi. */
export const strictTelegramPhone = (raw: string): string => `+${raw.replace(/\D/g, '')}`;
export const PHONE_VERIFICATION_TTL_MS = 15 * 60_000;

export const hashVerificationToken = async (token: string): Promise<string> => {
  const hasher = new Bun.CryptoHasher('sha256');
  hasher.update(token);
  return hasher.digest('hex');
};

/** `pv_<token>` → `<token>`; boshqa payload → `null`. */
export const parsePhoneVerifyPayload = (payload: string | undefined | null): string | null => {
  if (!payload?.startsWith(PV_START_PREFIX)) return null;
  const token = payload.slice(PV_START_PREFIX.length);
  return /^[A-Za-z0-9_-]{16,60}$/.test(token) ? token : null;
};

export type BindOutcome = 'bound' | 'invalid';

/**
 * `/start pv_<token>` — tokenni shu chat'ga bog'laydi. Noma'lum / muddati o'tgan /
 * ishlatilgan / boshqa klinika botiga tegishli / boshqa chat'ga bog'langan → `invalid`.
 */
export async function bindPhoneVerification(
  db: DbOrTx,
  o: { tenantId: string; token: string; chatId: string; now?: Date },
): Promise<BindOutcome> {
  const now = o.now ?? new Date();
  const tokenHash = await hashVerificationToken(o.token);
  const [row] = await db
    .select()
    .from(phoneVerifications)
    .where(eq(phoneVerifications.tokenHash, tokenHash))
    .limit(1);
  if (!row || row.tenantId !== o.tenantId) return 'invalid';
  if (row.consumedAt || row.expiresAt.getTime() <= now.getTime()) return 'invalid';
  if (row.telegramChatId && row.telegramChatId !== o.chatId) return 'invalid';
  if (!row.telegramChatId) {
    const [bound] = await db
      .update(phoneVerifications)
      .set({ telegramChatId: o.chatId })
      .where(and(eq(phoneVerifications.id, row.id), isNull(phoneVerifications.telegramChatId)))
      .returning({ id: phoneVerifications.id });
    // Poyga: boshqa chat bir vaqtda bog'lab ulgurdi.
    if (!bound) return 'invalid';
  }
  return 'bound';
}

/** Shu chat'da (shu bot) kutilayotgan, muddati o'tmagan tasdiq bormi. */
async function findPending(db: DbOrTx, tenantId: string, chatId: string, now: Date) {
  const [row] = await db
    .select()
    .from(phoneVerifications)
    .where(
      and(
        eq(phoneVerifications.tenantId, tenantId),
        eq(phoneVerifications.telegramChatId, chatId),
        isNull(phoneVerifications.consumedAt),
        gt(phoneVerifications.expiresAt, now),
      ),
    )
    .orderBy(desc(phoneVerifications.createdAt))
    .limit(1);
  return row ?? null;
}

export async function hasPendingPhoneVerification(
  db: DbOrTx,
  o: { tenantId: string; chatId: string; now?: Date },
): Promise<boolean> {
  return (await findPending(db, o.tenantId, o.chatId, o.now ?? new Date())) !== null;
}

export type VerifyOutcome = 'verified' | 'not_own_contact' | 'phone_mismatch' | 'expired';

/**
 * Kontakt kelganda: kutilayotgan token (shu bot + shu chat) → egalik va raqam
 * tekshiruvi → `users.phone_verified_at = now`, token yopiladi.
 */
export async function verifyPhoneByContact(
  db: DbOrTx,
  o: {
    tenantId: string;
    chatId: string;
    contactUserId: number | undefined;
    fromId: number;
    phone: string;
    now?: Date;
  },
): Promise<VerifyOutcome> {
  const now = o.now ?? new Date();
  const pending = await findPending(db, o.tenantId, o.chatId, now);
  if (!pending) return 'expired';
  // P8: faqat o'z kontakti. Token yoqilmaydi — foydalanuvchi to'g'ri tugmani bosishi mumkin.
  if (o.contactUserId === undefined || o.contactUserId !== o.fromId) return 'not_own_contact';

  return await db.transaction(async (tx) => {
    const [user] = await tx
      .select({ id: users.id, phone: users.phone })
      .from(users)
      .where(eq(users.id, pending.userId))
      .limit(1);
    // Tokenni avval yopamiz — mos kelmasa ham (bir martalik urinish).
    const [consumed] = await tx
      .update(phoneVerifications)
      .set({ consumedAt: now })
      .where(and(eq(phoneVerifications.id, pending.id), isNull(phoneVerifications.consumedAt)))
      .returning({ id: phoneVerifications.id });
    if (!consumed || !user) return 'expired' as const;

    // Telegram kontaktida mamlakat kodi doim bor — 9 xonali xorijiy raqam `normalizePhone`
    // orqali +998 deb o'qilmasligi uchun qat'iy solishtiriladi (verifier topdi).
    if (strictTelegramPhone(o.phone) !== normalizePhone(user.phone)) {
      await tx.insert(auditLog).values({
        tenantId: null,
        userId: user.id,
        action: 'phone.verification_failed',
        resourceType: 'user',
        resourceId: user.id,
        after: { reason: 'phone_mismatch', botTenantId: pending.tenantId },
        userAgent: 'telegram-bot',
      });
      return 'phone_mismatch' as const;
    }

    await tx
      .update(users)
      .set({ phoneVerifiedAt: now, updatedAt: now })
      .where(eq(users.id, user.id));
    // Foydalanuvchining qolgan ochiq tokenlari ham yopiladi.
    await tx
      .update(phoneVerifications)
      .set({ consumedAt: now })
      .where(and(eq(phoneVerifications.userId, user.id), isNull(phoneVerifications.consumedAt)));
    await tx.insert(auditLog).values({
      tenantId: null,
      userId: user.id,
      action: 'phone.verified',
      resourceType: 'user',
      resourceId: user.id,
      after: { botTenantId: pending.tenantId },
      userAgent: 'telegram-bot',
    });
    return 'verified' as const;
  });
}

/** Bot javoblari (uz — bot oqimining standart tili; foydalanuvchi hali bemor emas). */
export const phoneVerifyReplies = {
  askContact:
    "Telefon raqamingizni tasdiqlash uchun pastdagi «📱 Raqamni ulashish» tugmasini bosing. Faqat o'z raqamingizni ulashing. Agar bu so'rovni siz boshlamagan bo'lsangiz — hech narsa ulashmang.",
  shareButton: '📱 Raqamni ulashish',
  invalidLink:
    "⚠️ Havola yaroqsiz yoki muddati o'tgan. Ilovada «Telegram orqali tasdiqlash»ni qayta bosing.",
  verified: '✅ Raqamingiz tasdiqlandi. Ilovaga qaytib, taklifni qabul qilishingiz mumkin.',
  notOwnContact: "⚠️ Faqat o'z raqamingizni ulashing (tugma orqali).",
  phoneMismatch:
    '⚠️ Bu raqam hisobingizdagi raqamga mos kelmaydi. Tasdiq bekor qilindi — ilovadan qayta boshlang.',
  expired: "⚠️ Tasdiq muddati o'tgan. Ilovada «Telegram orqali tasdiqlash»ni qayta bosing.",
} as const;

export const phoneVerifyReplyFor = (o: VerifyOutcome): string =>
  ({
    verified: phoneVerifyReplies.verified,
    not_own_contact: phoneVerifyReplies.notOwnContact,
    phone_mismatch: phoneVerifyReplies.phoneMismatch,
    expired: phoneVerifyReplies.expired,
  })[o];
