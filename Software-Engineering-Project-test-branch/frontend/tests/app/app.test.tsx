import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const { mockMeQuery, mockTrpcClient } = vi.hoisted(() => {
  const mockMeQuery = vi.fn();
  const mockTrpcClient = {
    auth: {
      me: { query: mockMeQuery },
      logout: { mutate: vi.fn() },
    },
  };
  return { mockMeQuery, mockTrpcClient };
});

vi.mock('../../src/lib/trpc', () => ({
  createUlmsTrpcClient: () => mockTrpcClient,
  useTRPCClient: () => mockTrpcClient,
  TRPCProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('../../src/app/router', async () => {
  const React = await import('react');
  const { Route, Routes } = await import('react-router-dom');
  const { AppShell } = await import('../../src/components/layout/app-shell');
  const { ProtectedRoute } = await import('../../src/features/auth/protected-route');

  return {
    AppRouter: () =>
      React.createElement(
        Routes,
        null,
        React.createElement(Route, {
          path: '/login',
          element: React.createElement('div', { 'data-testid': 'login-route' }, 'Login'),
        }),
        React.createElement(Route, {
          path: '*',
          element: React.createElement(
            ProtectedRoute,
            null,
            React.createElement(AppShell),
          ),
        }),
      ),
  };
});

import { App } from '../../src/app/app';
import { useAuthStore } from '../../src/features/auth/auth.store';

describe('App auth bootstrap', () => {
  it('hydrates the store from auth.me and renders the user in the app shell', async () => {
    useAuthStore.getState().logout();
    useAuthStore.getState().setLoading(true);
    mockMeQuery.mockResolvedValueOnce({
      id: 42,
      studentId: 'ADM00042',
      firstName: 'Hydrated',
      lastName: 'Admin',
      email: 'hydrated.admin@ku.th',
      role: 'admin',
      facultyName: null,
      creditScore: 100,
      creditTier: 'D0',
      maxBorrowDays: 14,
      maxExtendTimes: 3,
    });

    render(<App />);

    await waitFor(() => expect(mockMeQuery).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getAllByText('Hydrated Admin').length).toBeGreaterThan(0));

    expect(useAuthStore.getState().user).toEqual(
      expect.objectContaining({
        name: 'Hydrated Admin',
        email: 'hydrated.admin@ku.th',
        role: 'admin',
      }),
    );
    expect(screen.getByRole('banner')).toBeInTheDocument();

    useAuthStore.getState().logout();
  });

  it('clears the store and redirects protected routes to login when auth.me rejects', async () => {
    useAuthStore.getState().logout();
    useAuthStore.getState().setLoading(true);
    mockMeQuery.mockClear();
    mockMeQuery.mockRejectedValueOnce(new Error('UNAUTHORIZED'));

    render(<App />);

    await waitFor(() => expect(mockMeQuery).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId('login-route')).toBeInTheDocument());

    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().isLoading).toBe(false);
  });
});
