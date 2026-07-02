import { describe, expect, test } from 'bun:test';
import { db } from './client';

// Regression test for the original supervisor-service bug: `drizzle(client)`
// was called WITHOUT the `{ schema }` option, so `db.query.*` (the relational
// query API) was `undefined` and blew up at runtime with a DrizzleTypeError
// the moment any module tried `db.query.adminUsers.findFirst(...)`.
//
// This test connects to the real `supervisor` dev database and asserts the
// relational query API actually resolves and returns an array.
describe('db client', () => {
  test('db.query.adminUsers.findMany() resolves and returns an array', async () => {
    const rows = await db.query.adminUsers.findMany();
    expect(Array.isArray(rows)).toBe(true);
  });
});
