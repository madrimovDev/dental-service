export const notificationKeys = {
  all: ['notifications'] as const,
  list: (params?: { page?: number; pageSize?: number }) =>
    ['notifications', 'list', params ?? {}] as const,
};
