import { Avatar, Mono, PageHead, Tabs } from '@dental/ui';
import { Alert, Text } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { lazy, Suspense, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { BalanceBadge } from '@/components/BalanceBadge';
import { useVertical } from '@/features/settings/settings.api.ts';
import { useAuthStore } from '@/stores/auth-store.ts';
import { useMedicalRecord, usePatient, usePatientBalance } from '../patients.api';
import { filterPatientTabs, type PatientTabDef } from '../visible-tabs';

const GeneralTab = lazy(() => import('./tabs/GeneralTab').then((m) => ({ default: m.GeneralTab })));
const MedicalTab = lazy(() => import('./tabs/MedicalTab').then((m) => ({ default: m.MedicalTab })));
const PaymentsTab = lazy(() =>
  import('./tabs/PaymentsTab').then((m) => ({ default: m.PaymentsTab })),
);
const FamilyTab = lazy(() => import('./tabs/FamilyTab').then((m) => ({ default: m.FamilyTab })));
const RecallTab = lazy(() => import('./tabs/RecallTab').then((m) => ({ default: m.RecallTab })));

const OdontogramTab = lazy(() =>
  import('@/features/clinical/components/odontogram/OdontogramTab').then((m) => ({
    default: m.OdontogramTab,
  })),
);
const TreatmentPlansTab = lazy(() =>
  import('@/features/clinical/components/treatment-plans/TreatmentPlansTab').then((m) => ({
    default: m.TreatmentPlansTab,
  })),
);
const VisitNotesTab = lazy(() =>
  import('@/features/clinical/components/visit-notes/VisitNotesTab').then((m) => ({
    default: m.VisitNotesTab,
  })),
);
const PrescriptionsTab = lazy(() =>
  import('@/features/clinical/components/prescriptions/PrescriptionsTab').then((m) => ({
    default: m.PrescriptionsTab,
  })),
);
const ConsentTab = lazy(() =>
  import('@/features/clinical/components/consent/ConsentTab').then((m) => ({
    default: m.ConsentTab,
  })),
);
const LabOrdersTab = lazy(() =>
  import('@/features/clinical/components/lab-orders/LabOrdersTab').then((m) => ({
    default: m.LabOrdersTab,
  })),
);
const PatientImagesTab = lazy(() =>
  import('@/features/clinical/components/images/PatientImagesTab').then((m) => ({
    default: m.PatientImagesTab,
  })),
);

const TABS: PatientTabDef[] = [
  { key: 'gen', labelKey: 'patients.tab.general' },
  { key: 'med', labelKey: 'patients.tab.medical' },
  {
    key: 'odo',
    labelKey: 'patients.tab.odontogram',
    permission: 'medical_record.view',
    feature: 'odontogram',
  },
  { key: 'plan', labelKey: 'patients.tab.plan', permission: 'medical_record.view' },
  { key: 'vis', labelKey: 'patients.tab.visits', permission: 'medical_record.view' },
  { key: 'rx', labelKey: 'patients.tab.rx', permission: 'prescription.view' },
  { key: 'img', labelKey: 'patients.tab.images', permission: 'patient_image.view' },
  { key: 'lab', labelKey: 'patients.tab.lab', permission: 'lab_order.view', feature: 'labOrders' },
  { key: 'cons', labelKey: 'patients.tab.consent', permission: 'consent.view' },
  { key: 'rec', labelKey: 'recall.tab.title', permission: 'recall.view' },
  { key: 'fam', labelKey: 'patients.tab.family' },
  { key: 'pay', labelKey: 'patients.tab.payments' },
];

export function PatientCard() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const { hasPermission } = useAuthStore();
  const [active, setActive] = useState('gen');
  const { data: patient } = usePatient(id);
  const { data: medical } = useMedicalRecord(hasPermission('medical_record.view') ? id : '');
  const balanceQuery = usePatientBalance(id);
  const vertical = useVertical();

  const visibleTabs = filterPatientTabs(TABS, hasPermission, vertical);
  const tabItems = visibleTabs.map((tb) => ({ id: tb.key, label: t(tb.labelKey) }));

  // Faol tab endi ko'rinmasa (vertical o'zgardi yoki yashirilgan odo/lab tab) — 'gen'ga qaytar.
  // Aks holda yashirilgan tab tarkibi render bo'lib qoladi (va backend'da 403 oladi).
  useEffect(() => {
    if (!visibleTabs.some((tb) => tb.key === active)) setActive('gen');
  }, [visibleTabs, active]);

  const severeAllergy = (medical?.allergies ?? []).find(
    (a) => a.severity === 'severe' && a.type === 'anesthetic',
  );

  return (
    <div>
      <PageHead
        title={
          <span style={{ alignItems: 'center', display: 'flex', gap: 12 }}>
            {patient && <Avatar name={patient.fullName} size="lg" />}
            <Text component="span" truncate maw={480}>
              {patient?.fullName ?? ''}
            </Text>
            {balanceQuery.data && <BalanceBadge balance={balanceQuery.data.balance} size="md" />}
          </span>
        }
        subtitle={patient?.phone ? <Mono>{patient.phone}</Mono> : undefined}
      />

      {severeAllergy && (
        <Alert color="red" icon={<IconAlertTriangle size={20} />} variant="filled" mb="md">
          <Text fw={700}>⚠️ {t('patients.severe_allergy_warning')}</Text>
          <Text size="sm">
            {severeAllergy.substance} ({severeAllergy.severity})
            {severeAllergy.notes && ` — ${severeAllergy.notes}`}
          </Text>
        </Alert>
      )}

      <Tabs items={tabItems} value={active} onChange={setActive} />
      <div style={{ marginTop: 16 }}>
        <Suspense fallback={null}>
          {active === 'gen' && patient && <GeneralTab patient={patient} />}
          {active === 'med' && <MedicalTab patientId={id} />}
          {active === 'odo' && <OdontogramTab patientId={id} />}
          {active === 'plan' && <TreatmentPlansTab patientId={id} />}
          {active === 'vis' && <VisitNotesTab patientId={id} />}
          {active === 'rx' && <PrescriptionsTab patientId={id} />}
          {active === 'img' && <PatientImagesTab patientId={id} />}
          {active === 'lab' && <LabOrdersTab patientId={id} />}
          {active === 'cons' && <ConsentTab patientId={id} />}
          {active === 'rec' && <RecallTab patientId={id} />}
          {active === 'fam' && <FamilyTab patientId={id} />}
          {active === 'pay' && <PaymentsTab patientId={id} />}
        </Suspense>
      </div>
    </div>
  );
}
