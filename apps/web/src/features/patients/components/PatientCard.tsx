import { Tabs } from '@dental/ui';
import { lazy, type ReactNode, Suspense, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { useVertical } from '@/features/settings/settings.api.ts';
import { useAuthStore } from '@/stores/auth-store.ts';
import { useMedicalRecord, usePatient, usePatientBalance } from '../patients.api';
import { filterPatientTabs, type PatientTabDef } from '../visible-tabs';
import { PatientOverview } from './overview/PatientOverview';
import { PatientHeaderCard } from './PatientHeaderCard';

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

/**
 * 4 bo'lim (UI-D2): Umumiy · Davolash · Moliya · Hujjatlar va rasmlar.
 * ⚠️ 4 bo'lim qarori usability testida tasdiqlanadi (tadqiqot: nazoratli dalil yo'q).
 * Bo'lim ko'rinishi ruxsat bilan belgilanadi: ruxsati yo'q bo'lim UMUMAN ko'rsatilmaydi
 * (Receptionist «Davolash»ni ko'rmaydi); bo'lim ichidagi ichki tab'lar ham alohida filtrlanadi.
 */
const SECTIONS: PatientTabDef[] = [
  { key: 'overview', labelKey: 'patientCard.section.overview' },
  {
    key: 'treatment',
    labelKey: 'patientCard.section.treatment',
    // Ichki tab'lar (rx/lab) boshqa ruxsatlar bilan ochiladi — bo'lim ularning birortasida ko'rinadi
    // (Branch Manager: prescription.view + lab_order.view, medical_record.view YO'Q; Technician: lab_order.view).
    anyPermission: ['medical_record.view', 'prescription.view', 'lab_order.view'],
  },
  { key: 'finance', labelKey: 'patientCard.section.finance', permission: 'cashier.view' },
  {
    key: 'docs',
    labelKey: 'patientCard.section.docs',
    anyPermission: ['patient_image.view', 'consent.view'],
  },
];

// Bo'lim ichki tab'lari (eski 12 tab'ning har biri o'z bo'limiga joylashgan).
const SUBTABS: Record<string, PatientTabDef[]> = {
  overview: [
    { key: 'gen', labelKey: 'patientCard.sub.details' },
    { key: 'med', labelKey: 'patientCard.sub.medical', permission: 'medical_record.view' },
    { key: 'fam', labelKey: 'patientCard.sub.family' },
    { key: 'rec', labelKey: 'patientCard.sub.recall', permission: 'recall.view' },
  ],
  treatment: [
    {
      key: 'odo',
      labelKey: 'patientCard.sub.odontogram',
      permission: 'medical_record.view',
      feature: 'odontogram',
    },
    { key: 'plan', labelKey: 'patientCard.sub.plan', permission: 'medical_record.view' },
    { key: 'vis', labelKey: 'patientCard.sub.visits', permission: 'medical_record.view' },
    { key: 'rx', labelKey: 'patientCard.sub.rx', permission: 'prescription.view' },
    {
      key: 'lab',
      labelKey: 'patientCard.sub.lab',
      permission: 'lab_order.view',
      feature: 'labOrders',
    },
  ],
  finance: [{ key: 'pay', labelKey: 'patientCard.sub.payments', permission: 'cashier.view' }],
  docs: [
    { key: 'img', labelKey: 'patientCard.sub.images', permission: 'patient_image.view' },
    { key: 'cons', labelKey: 'patientCard.sub.consent', permission: 'consent.view' },
  ],
};

const DEFAULT_SUB: Record<string, string> = {
  overview: 'gen',
  treatment: 'odo',
  finance: 'pay',
  docs: 'img',
};

export function PatientCard() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const { hasPermission } = useAuthStore();
  const [section, setSection] = useState('overview');
  const [sub, setSub] = useState<Record<string, string>>({});
  const { data: patient } = usePatient(id);
  const { data: medical } = useMedicalRecord(hasPermission('medical_record.view') ? id : '');
  const balanceQuery = usePatientBalance(id);
  const vertical = useVertical();

  const visibleSections = filterPatientTabs(SECTIONS, hasPermission, vertical);
  const hasDebt = (balanceQuery.data?.balance ?? 0) > 0;
  const sectionItems = visibleSections.map((s) => ({
    id: s.key,
    label: (
      <>
        {t(s.labelKey)}
        {s.key === 'finance' && hasDebt && (
          <span style={{ color: 'var(--danger)', fontSize: 13, fontWeight: 700 }}>
            {' · '}
            {t('patients.balance_debt')}
          </span>
        )}
      </>
    ),
  }));

  // Faol bo'lim ko'rinmasa (ruxsat/vertical o'zgardi) — 'overview'ga qaytar.
  useEffect(() => {
    if (!visibleSections.some((s) => s.key === section)) setSection('overview');
  }, [visibleSections, section]);

  const subTabs = filterPatientTabs(SUBTABS[section] ?? [], hasPermission, vertical);
  const activeSub = subTabs.some((s) => s.key === sub[section])
    ? (sub[section] as string)
    : (subTabs.find((s) => s.key === DEFAULT_SUB[section])?.key ?? subTabs[0]?.key ?? '');
  const selectSub = (key: string) => setSub((p) => ({ ...p, [section]: key }));
  const goTo = (sec: string, key: string) => {
    setSection(sec);
    setSub((p) => ({ ...p, [sec]: key }));
  };

  const subContent = (key: string): ReactNode => {
    switch (key) {
      case 'gen':
        return patient ? <GeneralTab patient={patient} /> : null;
      case 'med':
        return <MedicalTab patientId={id} />;
      case 'fam':
        return <FamilyTab patientId={id} />;
      case 'rec':
        return <RecallTab patientId={id} />;
      case 'odo':
        return <OdontogramTab patientId={id} />;
      case 'plan':
        return <TreatmentPlansTab patientId={id} />;
      case 'vis':
        return <VisitNotesTab patientId={id} />;
      case 'rx':
        return <PrescriptionsTab patientId={id} />;
      case 'lab':
        return <LabOrdersTab patientId={id} />;
      case 'pay':
        return <PaymentsTab patientId={id} />;
      case 'img':
        return <PatientImagesTab patientId={id} />;
      case 'cons':
        return <ConsentTab patientId={id} />;
      default:
        return null;
    }
  };

  return (
    <div>
      {patient && (
        <div style={{ marginBottom: 16 }}>
          <PatientHeaderCard patient={patient} allergies={medical?.allergies ?? undefined} />
        </div>
      )}

      <Tabs items={sectionItems} value={section} onChange={setSection} />

      <div style={{ marginTop: 20 }}>
        {section === 'overview' && (
          <>
            <PatientOverview
              patientId={id}
              onOpenPlan={() => goTo('treatment', 'plan')}
              onUpdateAnamnesis={() => goTo('overview', 'med')}
            />
            {subTabs.length > 0 && (
              <>
                <h2
                  style={{
                    color: 'var(--text-2)',
                    fontSize: 13,
                    letterSpacing: '.04em',
                    margin: '28px 0 8px',
                    textTransform: 'uppercase',
                  }}
                >
                  {t('patientCard.details')}
                </h2>
                <Tabs
                  items={subTabs.map((s) => ({ id: s.key, label: t(s.labelKey) }))}
                  value={activeSub}
                  onChange={selectSub}
                  variant="pill"
                />
                <div style={{ marginTop: 16 }}>
                  <Suspense fallback={null}>{subContent(activeSub)}</Suspense>
                </div>
              </>
            )}
          </>
        )}
        {section !== 'overview' && (
          <>
            {subTabs.length > 1 && (
              <Tabs
                items={subTabs.map((s) => ({ id: s.key, label: t(s.labelKey) }))}
                value={activeSub}
                onChange={selectSub}
                variant="pill"
              />
            )}
            <div style={{ marginTop: subTabs.length > 1 ? 16 : 0 }}>
              <Suspense fallback={null}>{subContent(activeSub)}</Suspense>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
