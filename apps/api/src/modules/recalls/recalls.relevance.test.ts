import { describe, expect, it } from 'bun:test';
import { isRebookRelevant } from './recalls.service.ts';

describe('CLI-426 isRebookRelevant (rebook grace window)', () => {
  it('long-future preventive (due +4 months) not closed by today booking', () => {
    const due = '2026-11-01';
    const bookingToday = new Date('2026-07-06T09:00:00+05:00');
    expect(isRebookRelevant(due, bookingToday)).toBe(false);
  });

  it('booking 10 days before due → relevant (within grace)', () => {
    const due = '2026-07-16';
    const booking = new Date('2026-07-06T09:00:00+05:00');
    expect(isRebookRelevant(due, booking)).toBe(true);
  });

  it('booking after due (late) → relevant', () => {
    const due = '2026-07-01';
    const booking = new Date('2026-07-06T09:00:00+05:00');
    expect(isRebookRelevant(due, booking)).toBe(true);
  });

  it('booking exactly 30 days before due → relevant (boundary)', () => {
    const due = '2026-08-05';
    const booking = new Date('2026-07-06T00:00:00Z');
    expect(isRebookRelevant(due, booking)).toBe(true);
  });

  it('booking 31 days before due → not relevant', () => {
    const due = '2026-08-06';
    const booking = new Date('2026-07-06T00:00:00Z');
    expect(isRebookRelevant(due, booking)).toBe(false);
  });

  it('malformed dueDate → falls back to closing (old behaviour)', () => {
    expect(isRebookRelevant('not-a-date', new Date())).toBe(true);
  });
});
