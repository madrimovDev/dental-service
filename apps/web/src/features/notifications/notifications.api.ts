import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '@dental/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notificationKeys } from './notifications.keys.ts';

/** Bildirishnoma feed (list + unreadCount). Har 60s avtomatik yangilanadi. */
export function useNotifications(query?: { page?: number; pageSize?: number }) {
  return useQuery({
    queryKey: notificationKeys.list(query),
    queryFn: () => listNotifications(query).then((r) => r.data),
    refetchInterval: 60_000,
  });
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => markNotificationRead(id).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: notificationKeys.all }),
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => markAllNotificationsRead().then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: notificationKeys.all }),
  });
}
