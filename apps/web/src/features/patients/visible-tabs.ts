import { hasFeature, type Vertical, type VerticalFeature } from '@dental/core';

export type PatientTabDef = {
  key: string;
  labelKey: string;
  permission?: string;
  /** Bo'lim ko'rinishi uchun shu ruxsatlardan KAMIDA BITTASI yetarli (permission bilan birga emas). */
  anyPermission?: string[];
  feature?: VerticalFeature;
};

/** Permission VA vertical-feature bo'yicha ko'rinadigan tab'lar. */
export function filterPatientTabs(
  tabs: PatientTabDef[],
  has: (p: string) => boolean,
  vertical: Vertical,
): PatientTabDef[] {
  return tabs.filter(
    (tb) =>
      (!tb.permission || has(tb.permission)) &&
      (!tb.anyPermission || tb.anyPermission.some((p) => has(p))) &&
      (!tb.feature || hasFeature(vertical, tb.feature)),
  );
}
