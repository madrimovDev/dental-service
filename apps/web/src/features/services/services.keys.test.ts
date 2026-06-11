import { describe, expect, it } from 'vitest';
import { serviceKeys } from './services.keys';

describe('serviceKeys', () => {
  it('list / detail / all kalitlari', () => {
    expect(serviceKeys.all).toEqual(['services']);
    expect(serviceKeys.list()).toEqual(['services', 'list']);
    expect(serviceKeys.detail('s1')).toEqual(['services', 'detail', 's1']);
    expect(serviceKeys.branches()).toEqual(['branches']);
  });
});
