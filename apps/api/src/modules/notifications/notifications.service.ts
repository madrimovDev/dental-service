import { notifications } from '@dental/db-schema';
import type { NotificationChannel } from '@dental/notifications';
import { and, count, desc, eq, isNull } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../db/client.ts';
import { getDb } from '../../db/scoped.ts';
import {
  type ListNotificationsQuery,
  type NotificationsFeed,
  toNotificationDto,
} from './notifications.schema.ts';

/** notifyInTx payload — worker va HTTP konteksti ham shu shaklni ishlatadi. */
export type NotifyPayload = {
  userId: string;
  type: string;
  title: string;
  body?: string;
  /** Berilsa — SMS ham yuboriladi (NoOp/Eskiz kanal orqali). */
  smsTo?: string;
};

/**
 * Notifications service — factory(deps).
 *
 * KRITIK kontrakt (worker tayanadi):
 *   createNotificationsService({ sms })
 *   notifyInTx(tx, tenantId, { userId, type, title, body?, smsTo? })
 */
export const createNotificationsService = (deps: { sms: NotificationChannel }) => {
  /**
   * Bildirishnoma yozadi (explicit tx — RLS `SET LOCAL` allaqachon o'rnatilgan
   * deb taxmin qiladi, lekin `tenantId` NOT NULL ustun bo'lgani uchun values'ga
   * yoziladi). `smsTo` berilsa — SMS yuboriladi (xato log qilinadi, throw EMAS).
   * Worker bevosita shuni chaqiradi.
   */
  async function notifyInTx(tx: DbOrTx, tenantId: string, payload: NotifyPayload) {
    const [row] = await tx
      .insert(notifications)
      .values({
        tenantId,
        userId: payload.userId,
        type: payload.type,
        title: payload.title,
        body: payload.body ?? null,
      })
      .returning();

    if (payload.smsTo) {
      try {
        const text = payload.title + (payload.body ? ` — ${payload.body}` : '');
        const res = await deps.sms.send(payload.smsTo, { text });
        if (!res.ok) {
          console.error(`[notifications] SMS yuborilmadi (${payload.smsTo}): ${res.error}`);
        }
      } catch (e) {
        console.error(
          `[notifications] SMS xato (${payload.smsTo}):`,
          e instanceof Error ? e.message : e,
        );
      }
    }

    return row;
  }

  /** HTTP konteksti o'ramasi — getDb(c) + activeTenantId orqali notifyInTx. */
  async function notify(c: Context, payload: NotifyPayload) {
    const tenantId = c.get('activeTenantId');
    if (!tenantId) throw new Error('No tenant context');
    return notifyInTx(getDb(c), tenantId, payload);
  }

  /** Foydalanuvchining feed'i (pagination) + meta. RLS tenant'ni, userId user'ni scope qiladi. */
  async function list(
    c: Context,
    userId: string,
    query: ListNotificationsQuery,
  ): Promise<NotificationsFeed> {
    const db = getDb(c);
    const offset = (query.page - 1) * query.pageSize;
    const where = eq(notifications.userId, userId);

    const [rows, totalRows] = await Promise.all([
      db
        .select()
        .from(notifications)
        .where(where)
        .orderBy(desc(notifications.createdAt))
        .limit(query.pageSize)
        .offset(offset),
      db.select({ total: count() }).from(notifications).where(where),
    ]);

    const total = Number(totalRows[0]?.total ?? 0);
    const unread = await unreadCount(c, userId);

    return {
      data: rows.map(toNotificationDto),
      unreadCount: unread,
      meta: { page: query.page, pageSize: query.pageSize, total },
    };
  }

  /** O'qilmagan bildirishnomalar soni. */
  async function unreadCount(c: Context, userId: string): Promise<number> {
    const db = getDb(c);
    const [row] = await db
      .select({ total: count() })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
    return Number(row?.total ?? 0);
  }

  /** Bitta bildirishnomani o'qilgan deb belgilaydi (userId guard — boshqa user row'iga tegmaydi). */
  async function markRead(c: Context, id: string, userId: string) {
    const db = getDb(c);
    const [row] = await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
      .returning();
    return row ?? null;
  }

  /** Foydalanuvchining barcha o'qilmaganlarini o'qilgan deb belgilaydi. */
  async function markAllRead(c: Context, userId: string) {
    const db = getDb(c);
    const rows = await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
      .returning({ id: notifications.id });
    return { count: rows.length };
  }

  return { notifyInTx, notify, list, unreadCount, markRead, markAllRead };
};

export type NotificationsService = ReturnType<typeof createNotificationsService>;
