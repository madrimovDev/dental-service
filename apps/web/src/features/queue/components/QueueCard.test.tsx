import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../test-utils';
import type { QueueCardVM } from '../queue.types';
import { QueueCard } from './QueueCard';

function makeVM(overrides: Partial<QueueCardVM> = {}): QueueCardVM {
  return {
    id: 't1',
    queueNumber: 6,
    status: 'waiting',
    patientName: 'Ali Valiyev',
    serviceName: 'Plomba',
    createdAt: '2026-06-22T09:00:00.000Z',
    calledAt: null,
    ...overrides,
  };
}

describe('QueueCard', () => {
  it('navbat raqamini mono A-NN chip sifatida ko’rsatadi (padStart)', () => {
    renderApp(<QueueCard vm={makeVM({ queueNumber: 6 })} canManage onStatus={vi.fn()} />);
    expect(screen.getByText('A-06')).toBeInTheDocument();
    // Eski "#N" formati olib tashlangan
    expect(screen.queryByText('#6')).not.toBeInTheDocument();
  });

  it('off-brand rangli status Badge render qilmaydi', () => {
    const { container } = renderApp(
      <QueueCard vm={makeVM({ status: 'in_progress' })} canManage onStatus={vi.fn()} />,
    );
    expect(container.querySelector('.mantine-Badge-root')).toBeNull();
  });

  it('bemor va xizmat nomini saqlaydi', () => {
    renderApp(
      <QueueCard
        vm={makeVM({ patientName: 'Ali Valiyev', serviceName: 'Plomba' })}
        canManage
        onStatus={vi.fn()}
      />,
    );
    expect(screen.getByText('Ali Valiyev')).toBeInTheDocument();
    expect(screen.getByText(/Plomba/)).toBeInTheDocument();
  });

  it('waiting + canManage: faqat call (Play) tugmasi', () => {
    const onStatus = vi.fn();
    renderApp(<QueueCard vm={makeVM({ status: 'waiting' })} canManage onStatus={onStatus} />);
    const call = screen.getByLabelText('Chaqirish');
    expect(call).toBeInTheDocument();
    call.click();
    expect(onStatus).toHaveBeenCalledWith('in_progress');
    // done/missed yo'q
    expect(screen.queryByText('Tugatildi')).not.toBeInTheDocument();
  });

  it('in_progress + canManage: done tugmasi + missed (X)', () => {
    const onStatus = vi.fn();
    renderApp(<QueueCard vm={makeVM({ status: 'in_progress' })} canManage onStatus={onStatus} />);
    const done = screen.getByText('Tugatildi');
    expect(done).toBeInTheDocument();
    done.click();
    expect(onStatus).toHaveBeenCalledWith('done');
    const missed = screen.getByLabelText('Kelmadi');
    expect(missed).toBeInTheDocument();
    missed.click();
    expect(onStatus).toHaveBeenCalledWith('missed');
  });

  it('done holatida amal tugmalari yo’q', () => {
    renderApp(<QueueCard vm={makeVM({ status: 'done' })} canManage onStatus={vi.fn()} />);
    expect(screen.queryByText('Tugatildi')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Chaqirish')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Kelmadi')).not.toBeInTheDocument();
  });

  it('canManage=false: amal tugmalari yo’q', () => {
    renderApp(
      <QueueCard vm={makeVM({ status: 'waiting' })} canManage={false} onStatus={vi.fn()} />,
    );
    expect(screen.queryByLabelText('Chaqirish')).not.toBeInTheDocument();
  });

  it('busy=true: tugmalar disabled', () => {
    renderApp(
      <QueueCard vm={makeVM({ status: 'in_progress' })} canManage busy onStatus={vi.fn()} />,
    );
    expect(screen.getByText('Tugatildi').closest('button')).toBeDisabled();
    expect(screen.getByLabelText('Kelmadi')).toBeDisabled();
  });
});
