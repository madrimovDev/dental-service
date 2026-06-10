import { Avatar, Mono, PageHead, Tabs } from '@dental/ui';
import { lazy, Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { usePatient } from '../patients.api';

const GeneralTab = lazy(() => import('./tabs/GeneralTab').then((m) => ({ default: m.GeneralTab })));
const MedicalTab = lazy(() => import('./tabs/MedicalTab').then((m) => ({ default: m.MedicalTab })));
const PaymentsTab = lazy(() =>
  import('./tabs/PaymentsTab').then((m) => ({ default: m.PaymentsTab })),
);

type TabDef = { key: string; labelKey: string; status: 'live' | 'soon' };

const TABS: TabDef[] = [
  { key: 'gen', labelKey: 'patients.tab.general', status: 'live' },
  { key: 'med', labelKey: 'patients.tab.medical', status: 'live' },
  { key: 'odo', labelKey: 'patients.tab.odontogram', status: 'soon' },
  { key: 'plan', labelKey: 'patients.tab.plan', status: 'soon' },
  { key: 'vis', labelKey: 'patients.tab.visits', status: 'soon' },
  { key: 'rx', labelKey: 'patients.tab.rx', status: 'soon' },
  { key: 'img', labelKey: 'patients.tab.images', status: 'soon' },
  { key: 'lab', labelKey: 'patients.tab.lab', status: 'soon' },
  { key: 'cons', labelKey: 'patients.tab.consent', status: 'soon' },
  { key: 'pay', labelKey: 'patients.tab.payments', status: 'live' },
];

function PlaceholderTabInline({ label }: { label: string }) {
  return <div style={{ color: 'var(--text-3)', padding: 48, textAlign: 'center' }}>{label}</div>;
}

export function PatientCard() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const [active, setActive] = useState('gen');
  const { data: patient } = usePatient(id);

  const tabItems = TABS.map((tb) => ({
    id: tb.key,
    label: tb.status === 'soon' ? `${t(tb.labelKey)} · ${t('shell.coming_soon')}` : t(tb.labelKey),
  }));

  const activeStatus = TABS.find((x) => x.key === active)?.status;

  return (
    <div>
      <PageHead
        title={
          <span style={{ alignItems: 'center', display: 'flex', gap: 12 }}>
            {patient && <Avatar name={patient.fullName} size="lg" />}
            {patient?.fullName ?? ''}
          </span>
        }
        subtitle={patient?.phone ? <Mono>{patient.phone}</Mono> : undefined}
      />
      <Tabs items={tabItems} value={active} onChange={setActive} />
      <div style={{ marginTop: 16 }}>
        <Suspense fallback={null}>
          {active === 'gen' && patient && <GeneralTab patient={patient} />}
          {active === 'med' && <MedicalTab patientId={id} />}
          {active === 'pay' && <PaymentsTab patientId={id} />}
          {activeStatus === 'soon' && <PlaceholderTabInline label={t('shell.coming_soon')} />}
        </Suspense>
      </div>
    </div>
  );
}
