export type Notification = {
  id: string;
  tenantId: string;
  userId: string;
  type: string;
  title: string;
  body: string | null;
  readAt: string | null;
  createdAt: string;
};

export type NotificationsFeed = {
  data: Notification[];
  unreadCount: number;
  meta: { page: number; pageSize: number; total: number };
};
