import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  branches,
  doctorSchedules,
  servicePrices,
  services,
  tenants,
  userAssignments,
} from '@dental/db-schema';
import { and, count, eq, isNotNull, isNull } from 'drizzle-orm';
import type { Context } from 'hono';
import { getDb } from '../../db/scoped.ts';
import { getLicenseState as defaultGetLicenseState, type LicenseState } from '../../lib/license.ts';
import type { ReadinessKey } from './tenant-settings.schema.ts';

export interface ReadinessItem {
  key: ReadinessKey;
  ok: boolean;
}

export interface ReadinessDeps {
  isDesktop?: () => boolean;
  getLicenseState?: () => Promise<LicenseState>;
  /** Zaxira holati (`backup-state.json`) — `lastSuccessAt` ISO yoki null. Faqat desktop. */
  readBackupLastSuccess?: () => Promise<string | null>;
}

const defaultReadBackupLastSuccess = async (): Promise<string | null> => {
  const uploads = process.env.UPLOADS_DIR;
  if (!uploads) return null;
  try {
    const raw = await readFile(join(dirname(uploads), 'backup-state.json'), 'utf8');
    const state = JSON.parse(raw) as { lastSuccessAt?: string | null };
    return state.lastSuccessAt ?? null;
  } catch {
    return null;
  }
};

/**
 * UI-M3 — «Klinika ishga tayyorligi N/7». Har element ixtiyoriy tekshiruv; hech narsa
 * yozilmaydi. Zaxira elementi faqat desktop rejimida (bulutda zaxira bo'limi yo'q).
 */
export const createReadinessService = (deps: ReadinessDeps = {}) => {
  const isDesktop = deps.isDesktop ?? (() => process.env.DENTAL_LOCAL_DESKTOP === 'true');
  const getLicenseState = deps.getLicenseState ?? defaultGetLicenseState;
  const readBackup = deps.readBackupLastSuccess ?? defaultReadBackupLastSuccess;

  const compute = async (c: Context): Promise<{ items: ReadinessItem[] }> => {
    const db = getDb(c);
    const desktop = isDesktop();

    const branchRows = await db
      .select({ workHours: branches.workHours })
      .from(branches)
      .where(isNull(branches.deletedAt));
    const workHoursOk =
      branchRows.length > 0 &&
      branchRows.every(
        (b) => b.workHours != null && Object.values(b.workHours).some((d) => d != null),
      );

    const [sched] = await db.select({ n: count() }).from(doctorSchedules);
    // Jadval yo'q bo'lsa filial ish soati fallback (P10) — shu ham "tayyor".
    const scheduleOk = (sched?.n ?? 0) > 0 || workHoursOk;

    const [priced] = await db
      .select({ n: count() })
      .from(servicePrices)
      .innerJoin(services, eq(services.id, servicePrices.serviceId))
      .where(and(isNull(services.deletedAt), eq(services.isActive, true)));
    const pricesOk = (priced?.n ?? 0) > 0;

    const settings = await db.query.tenantSettings.findFirst();
    const integ = (settings?.integrationSettings ?? {}) as Record<string, unknown>;
    const tg = integ.telegram as { botTokenEnc?: string } | undefined;
    const sms = integ.sms as { eskizPasswordEnc?: string } | undefined;
    const channelOk = !!tg?.botTokenEnc || !!sms?.eskizPasswordEnc;

    const staffRows = await db
      .selectDistinct({ userId: userAssignments.userId })
      .from(userAssignments)
      .where(and(eq(userAssignments.isActive, true), isNotNull(userAssignments.acceptedAt)));
    const staffOk = staffRows.length >= 2;

    let licenseOk: boolean;
    if (desktop) {
      const st = await getLicenseState().catch(() => null);
      licenseOk = st?.state === 'active' || st?.state === 'expiring';
    } else {
      const [t] = await db
        .select({ s: tenants.subscriptionStatus })
        .from(tenants)
        .where(eq(tenants.id, c.get('activeTenantId') as string));
      licenseOk = t?.s === 'active' || t?.s === 'trial';
    }

    const items: ReadinessItem[] = [
      { key: 'workHours', ok: workHoursOk },
      { key: 'doctorSchedule', ok: scheduleOk },
      { key: 'servicePrices', ok: pricesOk },
      { key: 'channel', ok: channelOk },
      { key: 'staff', ok: staffOk },
      { key: 'license', ok: licenseOk },
    ];
    if (desktop) items.push({ key: 'backup', ok: (await readBackup()) != null });
    return { items };
  };

  return { compute };
};
