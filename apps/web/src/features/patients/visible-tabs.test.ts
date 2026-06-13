import { describe, expect, it } from 'vitest';
import { filterPatientTabs, type PatientTabDef } from './visible-tabs';

const TABS: PatientTabDef[] = [
  { key: 'gen', labelKey: 'g' },
  { key: 'odo', labelKey: 'o', permission: 'medical_record.view', feature: 'odontogram' },
  { key: 'lab', labelKey: 'l', permission: 'lab_order.view', feature: 'labOrders' },
];
const allow = () => true;

describe('filterPatientTabs', () => {
  it("general vertical → odontogram va lab tab'lari yashirin", () => {
    const keys = filterPatientTabs(TABS, allow, 'general').map((t) => t.key);
    expect(keys).toEqual(['gen']);
  });
  it("dental vertical → ruxsat bo'lsa odo+lab ko'rinadi", () => {
    const keys = filterPatientTabs(TABS, allow, 'dental').map((t) => t.key);
    expect(keys).toEqual(['gen', 'odo', 'lab']);
  });
  it("permission yo'q → tab tushadi", () => {
    const keys = filterPatientTabs(TABS, () => false, 'dental').map((t) => t.key);
    expect(keys).toEqual(['gen']);
  });
});
