import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { caseKeys } from './cases.keys';
import type { CaseDetail, CasesResponse, LabUserDto, PriceItem, TabKey } from './cases.types';

const qs = (p: Record<string, string | undefined>) => {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v) u.set(k, v);
  const s = u.toString();
  return s ? `?${s}` : '';
};

export type CaseFilters = { tab: TabKey; technicianId?: string; dueBefore?: string };

export const useCases = (f: CaseFilters) =>
  useQuery({
    queryKey: caseKeys.list(f),
    queryFn: () => api.get<CasesResponse>(`/v1/lab/cases${qs(f)}`),
    refetchInterval: 30_000,
  });

/** Barcha ishlar (xulosa: ochiq ishlar, klinikalar, bugungi muddat, texnik yuklamasi). */
export const useAllCases = () =>
  useQuery({
    queryKey: caseKeys.summary,
    queryFn: () => api.get<CasesResponse>('/v1/lab/cases?limit=500'),
    refetchInterval: 30_000,
  });

export const useCaseDetail = (id: string | null) =>
  useQuery({
    queryKey: caseKeys.detail(id ?? ''),
    queryFn: () => api.get<CaseDetail>(`/v1/lab/cases/${id}`),
    enabled: !!id,
    refetchInterval: 15_000,
  });

export const useLabUsers = (enabled: boolean) =>
  useQuery({
    queryKey: caseKeys.users,
    queryFn: () => api.get<{ users: LabUserDto[] }>('/v1/lab/users'),
    enabled,
  });

export const usePriceList = (enabled: boolean) =>
  useQuery({
    queryKey: caseKeys.prices,
    queryFn: () => api.get<{ items: PriceItem[] }>('/v1/lab/price-list'),
    enabled,
  });

const useCaseMutation = <V>(fn: (id: string, v: V) => Promise<unknown>, id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: V) => fn(id, v),
    onSuccess: () => qc.invalidateQueries({ queryKey: caseKeys.all }),
  });
};

export const useAssign = (id: string) =>
  useCaseMutation(
    (cid, v: { technicianId: string | null }) => api.post(`/v1/lab/cases/${cid}/assign`, v),
    id,
  );

export const useSetStatus = (id: string) =>
  useCaseMutation(
    (cid, v: { to: 'accepted' | 'in_progress' | 'ready' | 'rejected'; reason?: string }) =>
      api.post(`/v1/lab/cases/${cid}/status`, v),
    id,
  );

export const usePropose = (id: string) =>
  useCaseMutation(
    (cid, v: { price: number; priceListItemId?: string }) =>
      api.post(`/v1/lab/cases/${cid}/price`, v),
    id,
  );

export const useSendMessage = (id: string) =>
  useCaseMutation((cid, v: { body: string }) => api.post(`/v1/lab/cases/${cid}/messages`, v), id);

export const useUploadFile = (id: string) =>
  useCaseMutation((cid, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.upload(`/v1/lab/cases/${cid}/files`, fd);
  }, id);
