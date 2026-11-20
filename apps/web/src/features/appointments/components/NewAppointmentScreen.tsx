import { useNavigate, useSearchParams } from 'react-router-dom';
import { NewAppointmentWizard } from './NewAppointmentWizard';

/**
 * UI-R3: `/appointments/new` — to'liq ekranli yozilish; yopilganda kalendarga qaytadi.
 * FT-05.1: `?doctorId&branchId&date&time` — kalendar katagidan oldindan to'ldirish.
 * FX-110: `?patientId=` (Bemorlar «Yozish», Recall «Rejalashtirish») bemorni oldindan tanlaydi.
 */
export function NewAppointmentScreen() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const patientId = params.get('patientId') ?? undefined;
  // FT-05.1: kalendar katagi/slot'i — shifokor, filial, sana (YYYY-MM-DD), vaqt (HH:MM).
  const doctorId = params.get('doctorId') ?? undefined;
  const branchId = params.get('branchId') ?? undefined;
  const date = params.get('date') ?? undefined;
  const time = params.get('time') ?? undefined;
  return (
    <NewAppointmentWizard
      onClose={() => navigate('/appointments')}
      initialPatientId={patientId}
      initialDoctorId={doctorId}
      initialBranchId={branchId}
      initialDate={date}
      initialTime={time}
    />
  );
}
