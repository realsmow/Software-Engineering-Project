import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

const { mockLogoutMutate, mockStoreLogout } = vi.hoisted(() => ({
  mockLogoutMutate: vi.fn(),
  mockStoreLogout: vi.fn(),
}));

vi.mock('../../src/lib/trpc', () => ({
  useTRPCClient: () => ({
    auth: { logout: { mutate: mockLogoutMutate } },
  }),
}));

vi.mock('../../src/features/auth/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({
      user: {
        id: '42',
        studentId: 'STF00042',
        name: 'Staff User',
        email: 'staff@ku.th',
        role: 'staff',
        departmentId: '',
        creditScore: 100,
        creditBand: 'D0',
      },
      logout: mockStoreLogout,
    }),
}));

import { Sidebar } from '../../src/components/layout/sidebar';

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}</output>;
}

describe('Sidebar logout', () => {
  it('calls logout, clears the store, and navigates to login', async () => {
    mockLogoutMutate.mockResolvedValueOnce({ ok: true });

    render(
      <MemoryRouter initialEntries={['/staff']}>
        <Sidebar />
        <LocationProbe />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'ออกจากระบบ' }));

    await waitFor(() => expect(mockLogoutMutate).toHaveBeenCalledTimes(1));
    expect(mockStoreLogout).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/login'));
  });
});
