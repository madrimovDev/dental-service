import { StateView } from '@dental/ui';
import { AlertTriangle } from 'lucide-react';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { type WithTranslation, withTranslation } from 'react-i18next';

type Props = WithTranslation & { children: ReactNode };
type State = { hasError: boolean };

class ErrorBoundaryInner extends Component<Props, State> {
  override state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info);
  }

  override render() {
    const { t, children } = this.props;
    if (this.state.hasError) {
      return (
        <StateView
          status="error"
          icon={<AlertTriangle size={32} />}
          title={t('errors.boundary_title')}
          description={t('errors.boundary_desc')}
          retryLabel={t('errors.reload')}
          onRetry={() => window.location.reload()}
        />
      );
    }
    return <>{children}</>;
  }
}

export const ErrorBoundary = withTranslation()(ErrorBoundaryInner);
