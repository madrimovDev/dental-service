import { getLicenseStatus, recheckLicense } from '@dental/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { licenseKeys } from './license.keys';

/** Litsenziya holati (ochiq endpoint). 5 daqiqada bir yangilanadi. */
export function useLicenseStatus() {
  return useQuery({
    queryKey: licenseKeys.status(),
    queryFn: () => getLicenseStatus().then((r) => r.data),
    refetchInterval: 5 * 60_000,
    retry: false,
  });
}

/** Heartbeat'ni darhol chaqiradi va yangilangan holatni qaytaradi. */
export function useRecheckLicense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => recheckLicense().then((r) => r.data),
    onSuccess: (data) => qc.setQueryData(licenseKeys.status(), data),
  });
}
