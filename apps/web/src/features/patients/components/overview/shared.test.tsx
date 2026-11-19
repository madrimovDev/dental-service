import { ApiError } from '@dental/api-client';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../../../../test-utils';
import { ForbiddenState } from './shared';

// FX-127 (LC-05): bemor kartasidagi klinik bloklar starter tarifda 403 MODULE_DISABLED
// oladi — «rolingizga yopiq» emas, «tarifingizda yo'q» ko'rinsin.
describe('ForbiddenState (FX-127)', () => {
  it("MODULE_DISABLED → «tarifingizda yo'q»", () => {
    renderApp(<ForbiddenState error={new ApiError('MODULE_DISABLED', 'x', 403)} />);
    expect(screen.getByText("Bu bo'lim tarifingizda yo'q")).toBeInTheDocument();
    expect(screen.queryByText("Bu ma'lumot sizning rolingizga yopiq")).toBeNull();
  });

  it("oddiy 403 → «rolingizga yopiq» (o'zgarmagan)", () => {
    renderApp(<ForbiddenState error={new ApiError('forbidden', 'x', 403)} />);
    expect(screen.getByText("Bu ma'lumot sizning rolingizga yopiq")).toBeInTheDocument();
  });
});
