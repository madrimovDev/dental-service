import { describe, expect, test } from 'bun:test';
import { z } from '@hono/zod-openapi';
import { apiResponseSchema, errorResponseSchema } from './openapi.ts';

describe('apiResponseSchema', () => {
  test('wraps data schema in success envelope', () => {
    const schema = apiResponseSchema(z.object({ name: z.string() }));
    const parsed = schema.parse({ success: true, data: { name: 'x' } });
    expect(parsed).toEqual({ success: true, data: { name: 'x' } });
  });

  test('rejects success:false on the success envelope', () => {
    const schema = apiResponseSchema(z.object({ name: z.string() }));
    expect(() => schema.parse({ success: false, data: { name: 'x' } })).toThrow();
  });
});

describe('errorResponseSchema', () => {
  test('accepts a well-formed error envelope', () => {
    const parsed = errorResponseSchema.parse({
      success: false,
      error: { code: 'bad', message: 'nope' },
    });
    expect(parsed.error.code).toBe('bad');
  });
});
