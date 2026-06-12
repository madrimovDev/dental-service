import type {
  LoginResponseDto,
  MembershipsResponseDto,
  RegisterTenantResponseDto,
  TokenPairResponseDto,
} from './auth.schema.ts';
import type { AuthService } from './auth.service.ts';

/**
 * Service natija → wire DTO.
 *
 * ⚠️ Token oqimi KRITIK: `accessToken` / `refreshToken` field nomlari va joylashuvi
 * hand `endpoints.ts` shaklidan bir piksel ham og'imaydi. Yagona transformatsiya —
 * `accessExpiresAt` Date → ISO string (wire tip `string`). Qolgani passthrough.
 */

type LoginResult = NonNullable<Awaited<ReturnType<AuthService['login']>>>;
type SwitchOkResult = Extract<Awaited<ReturnType<AuthService['switchWorkspace']>>, { ok: true }>;
type RefreshResult = NonNullable<Awaited<ReturnType<AuthService['refresh']>>>;
type RegisterResult = Awaited<ReturnType<AuthService['registerTenant']>>;
type MembershipsResult = Awaited<ReturnType<AuthService['getMemberships']>>;

/** Login natijasi → LoginResponse DTO. */
export const toLoginDto = (r: LoginResult): LoginResponseDto => ({
  user: {
    id: r.user.id,
    phone: r.user.phone,
    fullName: r.user.fullName ?? null,
    lang: r.user.lang ?? 'uz',
  },
  accessToken: r.accessToken,
  refreshToken: r.refreshToken,
  accessExpiresAt: r.accessExpiresAt.toISOString(),
});

/** Switch-workspace / refresh natijasi → access + refresh juftligi DTO. */
export const toTokenPairDto = (r: SwitchOkResult | RefreshResult): TokenPairResponseDto => ({
  accessToken: r.accessToken,
  refreshToken: r.refreshToken,
  accessExpiresAt: r.accessExpiresAt.toISOString(),
});

/** Register-tenant natijasi → RegisterTenantResponse DTO. */
export const toRegisterTenantDto = (r: RegisterResult): RegisterTenantResponseDto => ({
  userId: r.userId,
  tenantId: r.tenantId,
  slug: r.slug,
  branchId: r.branchId,
});

/** getMemberships natijasi + userId → MembershipsResponse DTO. */
export const toMembershipsDto = (userId: string, r: MembershipsResult): MembershipsResponseDto => ({
  userId,
  assignments: r.assignments.map((a) => ({
    tenantId: a.tenantId,
    tenantName: a.tenantName,
    tenantSlug: a.tenantSlug,
    branchId: a.branchId ?? null,
    branchName: a.branchName ?? null,
    roleId: a.roleId,
    roleName: a.roleName,
    isOwner: a.isOwner,
  })),
  ownerTenants: r.ownerTenants.map((t) => ({
    tenantId: t.tenantId,
    tenantName: t.tenantName,
    tenantSlug: t.tenantSlug,
  })),
});
