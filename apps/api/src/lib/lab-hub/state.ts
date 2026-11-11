import { labHubState, tenantSettings } from '@dental/db-schema';
import type { DbOrTx } from '../../db/client.ts';
import { decryptSecret } from '../crypto.ts';
import { readLicense } from '../license.ts';
import { type ConnectProof, LabHubError } from './client.ts';

/** RLS-bound: joriy tenantning yagona `lab_hub_state` qatori (yoki undefined). */
export const readLabHubState = async (tx: DbOrTx) => {
  const [row] = await tx.select().from(labHubState).limit(1);
  return row;
};

/** Hub kaliti (deshifrlangan) — ulanmagan bo'lsa null. */
export const hubKeyOf = (state: { hubKeyEnc: string | null } | undefined): string | null =>
  state?.hubKeyEnc ? decryptSecret(state.hubKeyEnc) : null;

export const isDesktopMode = () => process.env.DENTAL_LOCAL_DESKTOP === 'true';

/**
 * Hub `connect` isboti:
 *  - desktop — `.lic` dagi Supervisor klinika id'si + litsenziya kaliti (Hub Supervisor'dan tekshiradi);
 *  - SaaS (L8) — `tenant_settings.supervisor_clinic_id` + `LAB_HUB_SERVICE_TOKEN` xizmat kaliti.
 */
export const resolveConnectProof = async (tx: DbOrTx): Promise<ConnectProof> => {
  if (isDesktopMode()) {
    const lic = await readLicense();
    if (!lic) throw new LabHubError(400, 'lab_hub.no_license', false);
    return { supervisorClinicId: lic.clinicId, licenseKey: lic.licenseKey };
  }
  const token = process.env.LAB_HUB_SERVICE_TOKEN;
  if (!token) throw new LabHubError(400, 'lab_hub.service_token_missing', false);
  const [s] = await tx
    .select({ supervisorClinicId: tenantSettings.supervisorClinicId })
    .from(tenantSettings)
    .limit(1);
  if (!s?.supervisorClinicId) throw new LabHubError(409, 'lab_hub.not_registered', false);
  return { supervisorClinicId: s.supervisorClinicId, serviceProof: token };
};
