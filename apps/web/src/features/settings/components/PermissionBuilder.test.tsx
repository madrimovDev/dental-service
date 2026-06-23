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
  it("pill toggle (OFF→ON) → o'sha permission Set'ga qo'shiladi (xulq saqlanadi)", () => {
    const onChange = vi.fn();
    renderApp(<PermissionBuilder permissions={perms} selected={new Set()} onChange={onChange} />);
    // desc yo'q → label = code; toggle = role="switch" tugma
    fireEvent.click(screen.getByRole('switch', { name: 'cashier.refund' }));
    const next = onChange.mock.calls[0]?.[0] as Set<string>;
    expect([...next]).toEqual(['cashier.refund']);
  });

  it("pill toggle (ON→OFF) → o'sha permission Set'dan olib tashlanadi", () => {
    const onChange = vi.fn();
    renderApp(
      <PermissionBuilder
        permissions={perms}
        selected={new Set(['patient.view', 'cashier.refund'])}
        onChange={onChange}
      />,
    );
    const toggle = screen.getByRole('switch', { name: 'patient.view' });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(toggle);
    const next = onChange.mock.calls[0]?.[0] as Set<string>;
    expect(next.has('patient.view')).toBe(false);
    expect(next.has('cashier.refund')).toBe(true);
  });
});
