import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/trpc', () => ({
  useTRPCClient: () => ({
    auth: { login: { mutate: vi.fn() } },
  }),
}));

vi.mock('../../src/features/auth/auth.store', () => ({
  useAuthStore: (selector: (state: { setUser: () => void }) => unknown) =>
    selector({ setUser: vi.fn() }),
}));

vi.mock('../../src/hooks/use-theme', () => ({
  useTheme: () => ({ isDark: false, toggleTheme: vi.fn() }),
}));

import { LoginPage } from '../../src/features/auth/login-page';

describe('LoginPage accordion', () => {
  it('switches mutually exclusively between KU and Local panels', () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    const headers = screen.getAllByRole('button', { name: /KU|บัญชีภายในระบบ/ });
    const kuHeader = headers.find((header) => header.textContent?.includes('KU'))!;
    const localHeader = headers.find((header) => header.textContent?.includes('บัญชีภายในระบบ'))!;

    expect(kuHeader).toHaveAttribute('aria-expanded', 'true');
    expect(localHeader).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(localHeader);

    expect(kuHeader).toHaveAttribute('aria-expanded', 'false');
    expect(localHeader).toHaveAttribute('aria-expanded', 'true');
  });
});
