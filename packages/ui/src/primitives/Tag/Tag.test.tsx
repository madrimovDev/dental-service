import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderUI } from '../../test-utils';
import { Tag } from './Tag';

describe('Tag', () => {
  it('tarkibni render qiladi', () => {
    renderUI(<Tag>Sug'urta</Tag>);
    expect(screen.getByText("Sug'urta")).toBeInTheDocument();
  });
});
