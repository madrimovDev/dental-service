import { type ApiError, changePassword } from '@dental/api-client';
import { type UseMutationOptions, useMutation } from '@tanstack/react-query';

type ChangePasswordVars = { currentPassword: string; newPassword: string };
type ChangePasswordData = Awaited<ReturnType<typeof changePassword>>['data'];

export function useChangePassword(
  opts?: UseMutationOptions<ChangePasswordData, ApiError, ChangePasswordVars>,
) {
  return useMutation({
    mutationFn: (body: ChangePasswordVars) => changePassword(body).then((r) => r.data),
    ...opts,
  });
}
