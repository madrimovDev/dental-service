import { describe, expect, test } from 'bun:test';
import { configureClient, customInstance, isClientConfigured } from './mutator.ts';

describe('mutator', () => {
  test('customInstance is a function', () => {
    expect(typeof customInstance).toBe('function');
  });

  test('configureClient marks the client ready', () => {
    configureClient({ baseUrl: '', getAccessToken: () => null });
    expect(isClientConfigured()).toBe(true);
  });
});
