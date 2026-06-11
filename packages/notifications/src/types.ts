// @dental/notifications — kanal abstraksiya tiplari.

export type NotificationMessage = { text: string };
export type SendResult = { ok: boolean; providerId?: string; error?: string };

export interface NotificationChannel {
  send(to: string, message: NotificationMessage): Promise<SendResult>;
}
