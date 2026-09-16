import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

const { mockLoginMutate, mockSetUser } = vi.hoisted(() => ({
  mockLoginMutate: vi.fn(),
  mockSetUser: vi.fn(),
}));

vi.mock('../../src/lib/trpc', () => ({
  useTRPCClient: () => ({
    auth: { login: { mutate: mockLoginMutate } },
  }),
}));

vi.mock('../../src/features/auth/auth.store', () => ({
  useAuthStore: (selector: (state: { setUser: () => void }) => unknown) =>
    selector({ setUser: mockSetUser }),
}));

vi.mock('../../src/hooks/use-theme', () => ({
  useTheme: () => ({ isDark: false, toggleTheme: vi.fn() }),
}));

import { LoginPage } from '../../src/features/auth/login-page';

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}</output>;
}

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

  it('submits KU credentials, stores the user, and redirects to the role home', async () => {
    mockLoginMutate.mockResolvedValueOnce({
      user: {
        id: 42,
        studentId: 'ADM00042',
        firstName: 'Admin',
        lastName: 'User',
        email: 'admin@ku.th',
        role: 'admin',
        facultyName: null,
        creditScore: 100,
        creditTier: 'D0',
        maxBorrowDays: 14,
        maxExtendTimes: 3,
      },
    });

    render(
      <MemoryRouter initialEntries={['/login']}>
        <LoginPage />
        <LocationProbe />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText('อีเมล KU'), {
      target: { value: 'admin@ku.th' },
    });
    fireEvent.change(screen.getByLabelText('รหัสผ่าน'), {
      target: { value: 'admin1234' },
    });
    fireEvent.submit(screen.getByLabelText('อีเมล KU').closest('form')!);

    await waitFor(() => {
      expect(mockLoginMutate).toHaveBeenCalledWith({
        username: 'admin@ku.th',
        password: 'admin1234',
      });
    });
    expect(mockSetUser).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'admin', email: 'admin@ku.th' }),
    );
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/admin'));
  });
});
