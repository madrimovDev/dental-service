import { fail } from '@dental/core';
import type { ErrorHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { ZodError, z } from 'zod';
import { logger } from '../lib/logger.ts';

export const errorHandler: ErrorHandler = (err, c) => {
  const requestId = c.get('requestId');

  if (err instanceof HTTPException) {
    return c.json(fail('http_error', err.message), err.status);
  }

  if (err instanceof ZodError) {
    return c.json(fail('validation_error', 'Validation failed', z.treeifyError(err)), 400);
  }

  logger.error({ err, requestId }, 'Unhandled error');
  return c.json(fail('internal_error', 'Internal server error'), 500);
};
