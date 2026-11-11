// @dental/notifications — kanal abstraksiya tiplari.

/** Inline tugma (faqat Telegram kanali ishlatadi; SMS e'tiborsiz qoldiradi). */
export type MessageButton = { text: string; data: string };
export type NotificationMessage = { text: string; buttons?: MessageButton[][] };
export type SendResult = { ok: boolean; providerId?: string; error?: string };

export interface NotificationChannel {
  send(to: string, message: NotificationMessage): Promise<SendResult>;
}
