import { useNavigate } from 'react-router-dom';
import { NewAppointmentWizard } from './NewAppointmentWizard';

/** UI-R3: `/appointments/new` — to'liq ekranli yozilish; yopilganda kalendarga qaytadi. */
export function NewAppointmentScreen() {
  const navigate = useNavigate();
  return <NewAppointmentWizard onClose={() => navigate('/appointments')} />;
}
