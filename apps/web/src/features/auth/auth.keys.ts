// Query-key factory (RFC-0010 §3). Inline key'lar bilan byte-identical:
//   me() -> ['auth','me'], workspaceBranches(id) -> ['auth','workspace-branches', id]
export const authKeys = {
  all: ['auth'] as const,
  me: () => ['auth', 'me'] as const,
  workspaceBranches: (tenantId: string | null) => ['auth', 'workspace-branches', tenantId] as const,
  registrationEnabled: () => ['auth', 'registration-enabled'] as const,
};
