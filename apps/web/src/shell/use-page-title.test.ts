import { describe, expect, it } from 'vitest';
import { pageTitleKey } from './use-page-title';

describe('pageTitleKey', () => {
  it('/patients → nav.patients', () => {
    expect(pageTitleKey('/patients')).toBe('nav.patients');
  });

  it('/appointments → nav.appointments', () => {
    expect(pageTitleKey('/appointments')).toBe('nav.appointments');
  });

  it('/queue → nav.queue', () => {
    expect(pageTitleKey('/queue')).toBe('nav.queue');
  });

  it('/cashier → nav.cashier', () => {
    expect(pageTitleKey('/cashier')).toBe('nav.cashier');
  });

  it('/reports → nav.reports', () => {
    expect(pageTitleKey('/reports')).toBe('nav.reports');
  });

  it('/schedule → nav.schedule', () => {
    expect(pageTitleKey('/schedule')).toBe('nav.schedule');
  });

  it('/recalls → nav.recalls', () => {
    expect(pageTitleKey('/recalls')).toBe('nav.recalls');
  });

  it('/ → nav.dashboard', () => {
    expect(pageTitleKey('/')).toBe('nav.dashboard');
  });

  it('unknown route → fallback app.name key', () => {
    expect(pageTitleKey('/zzz-unknown')).toBe('app.name');
  });
});
