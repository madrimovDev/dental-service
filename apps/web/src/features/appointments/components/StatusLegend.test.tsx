import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../../../test-utils';
import { StatusLegend } from './StatusLegend';

// EGALI: ushbu komponent `./StatusIndicator` (DS4-1) ni IMPORT qiladi — bloklar bilan
// dot/check vizual drift bo'lmasin uchun. Bu test FAQAT DS4-1 land bo'lgach yashil bo'ladi
// (sequence-dependency, fayl-egaligi disjoint; plan §"Bajarish tartibi").

describe('StatusLegend', () => {
  it('4 status legend elementini ko‘rsatadi (confirmed/scheduled/in_progress/completed)', () => {
    renderApp(<StatusLegend />);
    expect(screen.getByTestId('legend-item-confirmed')).toBeInTheDocument();
    expect(screen.getByTestId('legend-item-scheduled')).toBeInTheDocument();
    expect(screen.getByTestId('legend-item-in_progress')).toBeInTheDocument();
    expect(screen.getByTestId('legend-item-completed')).toBeInTheDocument();
  });

  it("trailing drag-maslahati ('surib ko'chiring · bosib qo'shing') OLIB TASHLANGAN", () => {
    renderApp(<StatusLegend />);
    expect(screen.queryByText(/surib/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/bosib/i)).not.toBeInTheDocument();
  });
});
