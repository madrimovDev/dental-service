import { describe, expect, it } from 'bun:test';
import {
  assertQueueTransition,
  isValidQueueTransition,
  type QueueTicketStatus,
  QueueTransitionError,
} from './queue.transitions.ts';

describe('A6 (CLI-438) queue ticket transition matrix', () => {
  const valid: [QueueTicketStatus, QueueTicketStatus][] = [
    ['waiting', 'in_progress'],
    ['waiting', 'done'], // CLI-425 quick-done flow, must stay allowed
    ['waiting', 'missed'],
    ['in_progress', 'done'],
    ['in_progress', 'missed'],
    ['waiting', 'waiting'], // idempotent
    ['done', 'done'], // idempotent (CLI-425 "idempotent done twice")
    ['missed', 'missed'],
  ];

  const invalid: [QueueTicketStatus, QueueTicketStatus][] = [
    ['done', 'waiting'],
    ['done', 'in_progress'],
    ['done', 'missed'],
    ['missed', 'waiting'],
    ['missed', 'in_progress'],
    ['missed', 'done'],
    ['in_progress', 'waiting'],
  ];

  for (const [from, to] of valid) {
    it(`${from} → ${to} is valid`, () => {
      expect(isValidQueueTransition(from, to)).toBe(true);
      expect(() => assertQueueTransition(from, to)).not.toThrow();
    });
  }

  for (const [from, to] of invalid) {
    it(`${from} → ${to} is INVALID`, () => {
      expect(isValidQueueTransition(from, to)).toBe(false);
      expect(() => assertQueueTransition(from, to)).toThrow(QueueTransitionError);
    });
  }

  it('error carries status.invalid_transition code', () => {
    try {
      assertQueueTransition('done', 'waiting');
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(QueueTransitionError);
      expect((e as QueueTransitionError).code).toBe('status.invalid_transition');
    }
  });
});
