import { describe, expect, it } from 'vitest';
import { queueKeys } from './queue.keys';

describe('queueKeys', () => {
  it("today/candidates branch bo'yicha kalit", () => {
    expect(queueKeys.today('b1')).toEqual(['queue', 'today', 'b1']);
    expect(queueKeys.candidates('b1')).toEqual(['queue', 'candidates', 'b1']);
    expect(queueKeys.all).toEqual(['queue']);
  });
});
