import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { RequireAuth } from './RequireAuth';

const renderWithRoutes = (initialEntry: string) =>
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/login" element={<div>Login Page</div>} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <div>Protected Content</div>
            </RequireAuth>
          }
        />
      </Routes>
    </MemoryRouter>,
  );

describe('RequireAuth', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("admin_token yo'q bo'lsa /login ga redirect qiladi", () => {
    renderWithRoutes('/');
    expect(screen.getByText('Login Page')).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it("admin_token mavjud bo'lsa children render qilinadi", () => {
    localStorage.setItem('admin_token', 'jwt-token-123');
    renderWithRoutes('/');
    expect(screen.getByText('Protected Content')).toBeInTheDocument();
    expect(screen.queryByText('Login Page')).not.toBeInTheDocument();
  });
});
