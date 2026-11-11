/**
 * Hub → Supervisor ichki API: klinikani tekshirish (connect paytida).
 * `GET /internal/clinics/:id/verify` (`Authorization: Bearer SUPERVISOR_HUB_TOKEN`).
 */
export type ClinicVerification = {
  clinicId: string;
  name: string;
  mode: 'desktop' | 'saas';
  active: boolean;
  expiresAt: string | null;
  licenseMatches: boolean;
};

export type SupervisorClient = {
  verifyClinic(
    supervisorClinicId: string,
    opts: { licenseKey?: string },
  ): Promise<ClinicVerification | null>;
};

export const createSupervisorClient = (cfg: {
  baseUrl: string | null;
  token: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}): SupervisorClient => ({
  async verifyClinic(id, opts) {
    if (!cfg.baseUrl) throw new Error('supervisor.not_configured');
    const url = new URL(`/internal/clinics/${encodeURIComponent(id)}/verify`, cfg.baseUrl);
    if (opts.licenseKey) url.searchParams.set('licenseKey', opts.licenseKey);
    const res = await (cfg.fetch ?? fetch)(url, {
      headers: { Authorization: `Bearer ${cfg.token}` },
      signal: AbortSignal.timeout(cfg.timeoutMs ?? 5000),
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`supervisor.verify_failed:${res.status}`);
    return (await res.json()) as ClinicVerification;
  },
});
