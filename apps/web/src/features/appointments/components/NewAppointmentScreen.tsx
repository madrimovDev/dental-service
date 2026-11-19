import { useNavigate, useSearchParams } from 'react-router-dom';
import { NewAppointmentWizard } from './NewAppointmentWizard';

/**
 * UI-R3: `/appointments/new` — to'liq ekranli yozilish; yopilganda kalendarga qaytadi.
 * FX-110: `?patientId=` (Bemorlar «Yozish», Recall «Rejalashtirish») bemorni oldindan tanlaydi.
 */
export function NewAppointmentScreen() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const patientId = params.get('patientId') ?? undefined;
  return (
    <NewAppointmentWizard onClose={() => navigate('/appointments')} initialPatientId={patientId} />
  );
}
