import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderUI } from '../../test-utils';
import { Avatar } from './Avatar';

describe('Avatar', () => {
  it('ismdan 2 ta bosh harf chiqaradi', () => {
    renderUI(<Avatar name="Ali Valiyev" />);
    expect(screen.getByText('AV')).toBeInTheDocument();
  });

  it("bitta so'zdan 1 harf", () => {
    renderUI(<Avatar name="Doniyor" />);
    expect(screen.getByText('D')).toBeInTheDocument();
  });
});
