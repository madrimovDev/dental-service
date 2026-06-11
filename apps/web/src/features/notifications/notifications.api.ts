import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api.ts';
import { notificationKeys } from './notifications.keys.ts';

/** Bildirishnoma feed (list + unreadCount). Har 60s avtomatik yangilanadi. */
export function useNotifications(query?: { page?: number; pageSize?: number }) {
  return useQuery({
    queryKey: notificationKeys.list(query),
    queryFn: () => api.notifications.list(query),
    refetchInterval: 60_000,
  });
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.notifications.markRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: notificationKeys.all }),
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.notifications.markAllRead(),
    onSuccess: () => qc.invalidateQueries({ queryKey: notificationKeys.all }),
  });
}
