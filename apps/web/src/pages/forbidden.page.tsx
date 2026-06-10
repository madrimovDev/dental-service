import { Button, Card, PageHead } from '@dental/ui';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

export function ForbiddenPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <Card>
      <PageHead title={t('error.403_title')} subtitle={t('error.403_message')} />
      <Button variant="primary" onClick={() => navigate('/')}>
        {t('error.403_back')}
      </Button>
    </Card>
  );
}
