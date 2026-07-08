import { describe, expect, it } from 'vitest';
import { appointmentKeys } from '@/features/appointments/appointments.keys';
import { cashierKeys } from '@/features/cashier/cashier.keys';
import { serviceKeys } from '@/features/services/services.keys';
import { lookupKeys } from './lookup-keys';

// Cross-feature cache-sharing kontrakti — bu key'lar byte-identical bo'lishi SHART,
// aks holda ataylab bo'lishilgan cache buziladi yoki invalidatsiya query'ga tegmaydi.
describe('lookupKeys (cross-feature)', () => {
  it("umumiy lookup key string lari o'zgarmaydi", () => {
    expect(lookupKeys.branches()).toEqual(['branches']);
    expect(lookupKeys.services()).toEqual(['services']);
    // CLI-454: `search` endi key'ga kiradi (debounced server-search — cache
    // search-bo'yicha ajratiladi); bo'sh qidiruv hali ham cross-feature "hamma
    // bemor" cache yozuviga mos keladi.
    expect(lookupKeys.patientsAll()).toEqual(['patients', 'list-all', '']);
    expect(lookupKeys.patientsAll('Vali')).toEqual(['patients', 'list-all', 'Vali']);
    expect(lookupKeys.userAssignments()).toEqual(['users', 'assignments']);
  });
});

describe('cross-feature invalidatsiya prefiks munosabati', () => {
  it('queue → appointment invalidatsiya appointment query prefiksiga mos', () => {
    // queue.useUpdateQueueStatus appointmentKeys.all bilan invalidate qiladi —
    // u appointmentKeys.list(...) ning prefiksi bo'lishi kerak.
    const all = appointmentKeys.all;
    const list = appointmentKeys.list({ from: 'a', to: 'b' });
    expect(list.slice(0, all.length)).toEqual([...all]);
  });

  it('cashier plans invalidatsiya patientPlans query prefiksiga mos', () => {
    const root = cashierKeys.plans;
    const byPatient = cashierKeys.patientPlans('p1');
    expect(byPatient.slice(0, root.length)).toEqual([...root]);
    expect(root).toEqual(['treatment-plans']);
  });

  it('cashier fetchServicePrices services feature detail key bilan bir xil', () => {
    expect(serviceKeys.detail('s1')).toEqual(['services', 'detail', 's1']);
  });
});
