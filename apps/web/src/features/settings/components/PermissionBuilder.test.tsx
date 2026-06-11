import type { PermissionDef } from '@dental/api-client';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../test-utils';
import { PermissionBuilder } from './PermissionBuilder';

function perm(code: string): PermissionDef {
  return { id: code, code, category: 'misc', descriptionUz: null, descriptionRu: null };
}

const perms = [perm('patient.view'), perm('patient.create'), perm('cashier.refund')];

describe('PermissionBuilder', () => {
  it('guruh toggle → guruhdagi barcha permission tanlanadi', () => {
    const onChange = vi.fn();
    renderApp(<PermissionBuilder permissions={perms} selected={new Set()} onChange={onChange} />);
    // "Bemorlar" guruh sarlavhasi checkbox'i (settings.perm_group.patient)
    fireEvent.click(screen.getByLabelText('Bemorlar'));
    const next = onChange.mock.calls[0]?.[0] as Set<string>;
    expect(next.has('patient.view')).toBe(true);
    expect(next.has('patient.create')).toBe(true);
    expect(next.has('cashier.refund')).toBe(false);
  });

  it("individual checkbox → faqat o'sha permission", () => {
    const onChange = vi.fn();
    renderApp(<PermissionBuilder permissions={perms} selected={new Set()} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('cashier.refund'));
    const next = onChange.mock.calls[0]?.[0] as Set<string>;
    expect([...next]).toEqual(['cashier.refund']);
  });
});
