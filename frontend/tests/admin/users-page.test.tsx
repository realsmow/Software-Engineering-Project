import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../src/i18n';
import UsersPage from '../../src/features/admin/users/users-page';
import type { AdminUser } from '../../src/features/admin/mock-data';
import * as adminUsersHooks from '../../src/features/admin/users/use-admin-users';

/** UI-model fixtures: API numeric IDs are intentionally adapted to strings. */
const USERS: AdminUser[] = [
  {
    id: '1', govId: 'ADM00001', name: 'Somchai Admin', email: 'somchai.a@ku.th',
    role: 'admin', status: 'active', auth: 'ku', departmentId: 'cpe',
    lastActiveAt: '2026-09-01T10:00:00Z', createdAt: '2026-01-10T08:00:00Z',
  },
  {
    id: '2', govId: 'STF00002', name: 'Somsri Staff', email: 'somsri.s@ku.th',
    role: 'staff', status: 'active', auth: 'local', departmentId: 'cpe',
    lastActiveAt: '2026-09-02T11:00:00Z', createdAt: '2026-02-15T08:00:00Z',
  },
  {
    id: '3', govId: '65019999', name: 'Somsak Student', email: 'somsak.j@ku.th',
    role: 'borrower', status: 'suspended', auth: 'ku', departmentId: 'cpe',
    lastActiveAt: '2026-08-30T09:00:00Z', createdAt: '2026-03-20T08:00:00Z',
  },
  {
    id: '4', govId: '65018888', name: 'Wichai Disabled', email: 'wichai.d@ku.th',
    role: 'borrower', status: 'disabled', auth: 'ku', departmentId: 'me',
    lastActiveAt: '2026-07-25T14:00:00Z', createdAt: '2026-04-10T08:00:00Z',
  },
];

describe('Admin users page', () => {
  let queryClient: QueryClient;
  const createMutate = vi.fn();
  const changeRoleMutate = vi.fn();
  const resetPasswordMutate = vi.fn();
  const setUserBanMutate = vi.fn();
  const setUserActiveMutate = vi.fn();

  const t = (key: string) => i18n.t(key);

  const renderPage = () =>
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <UsersPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

  const openUser = (name: string) => {
    fireEvent.click(screen.getByText(name).closest('tr')!);
  };

  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.clearAllMocks();
    vi.spyOn(adminUsersHooks, 'useAdminUsers').mockReturnValue({
      data: USERS, isLoading: false, isError: false, error: null, refetch: vi.fn(),
    } as never);
    vi.spyOn(adminUsersHooks, 'useCreateUser').mockReturnValue({
      mutate: createMutate, isPending: false,
    } as never);
    vi.spyOn(adminUsersHooks, 'useChangeRole').mockReturnValue({
      mutate: changeRoleMutate, isPending: false,
    } as never);
    vi.spyOn(adminUsersHooks, 'useResetPassword').mockReturnValue({
      mutate: resetPasswordMutate, isPending: false,
    } as never);
    vi.spyOn(adminUsersHooks, 'useSetUserBan').mockReturnValue({
      mutate: setUserBanMutate, isPending: false,
    } as never);
    vi.spyOn(adminUsersHooks, 'useSetUserActive').mockReturnValue({
      mutate: setUserActiveMutate, isPending: false,
    } as never);
  });

  it('shows contract-derived account statuses and filters by suspension', () => {
    renderPage();

    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    const suspendedChip = screen.getAllByText(t('admin.users.statusSuspended'))[0].closest('button');
    expect(suspendedChip).not.toBeNull();

    fireEvent.click(suspendedChip!);

    expect(screen.getByText('Somsak Student')).toBeInTheDocument();
    expect(screen.queryByText('Somchai Admin')).not.toBeInTheDocument();
    expect(screen.queryByText('Wichai Disabled')).not.toBeInTheDocument();
  });

  it('filters users by a case-insensitive name, email, or institutional ID query', () => {
    renderPage();
    const search = screen.getByRole('textbox', { name: t('common.search') });

    fireEvent.change(search, { target: { value: 'stf00002' } });

    expect(screen.getByText('Somsri Staff')).toBeInTheDocument();
    expect(screen.queryByText('Somchai Admin')).not.toBeInTheDocument();
  });

  it('sends the form-derived, contract-shaped create payload', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: t('admin.users.createUser') }));

    const dialog = screen.getByRole('dialog');
    fireEvent.change(screen.getByPlaceholderText(t('admin.users.namePlaceholder')), {
      target: { value: 'New Test User' },
    });
    fireEvent.change(screen.getByPlaceholderText('name@ku.th'), {
      target: { value: 'new.test@ku.th' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: t('admin.users.createSubmit') }));

    await waitFor(() => {
      expect(createMutate).toHaveBeenCalledWith(
        {
          email: 'new.test@ku.th',
          studentId: 'new.test',
          firstName: 'New',
          lastName: 'Test User',
          role: 'borrower',
        },
        expect.any(Object),
      );
    });
  });

  it('requests a borrowing ban for the selected active account', () => {
    renderPage();
    openUser('Somsri Staff');

    fireEvent.click(screen.getByRole('button', { name: t('admin.users.suspend') }));

    expect(setUserBanMutate).toHaveBeenCalledWith(
      { id: '2', banned: true },
      expect.any(Object),
    );
  });

  it('requests account deactivation separately from a borrowing ban', () => {
    renderPage();
    openUser('Somsri Staff');

    fireEvent.click(screen.getByRole('button', { name: t('admin.users.deactivate') }));

    expect(setUserActiveMutate).toHaveBeenCalledWith(
      { id: '2', active: false },
      expect.any(Object),
    );
  });

  it('requests a role change using the selected account ID and enum value', () => {
    renderPage();
    openUser('Somsri Staff');

    const roleSelect = screen.getAllByRole('combobox').at(-1)!;
    fireEvent.click(roleSelect);
    fireEvent.click(screen.getByRole('option', { name: t('nav.borrower') }));

    expect(changeRoleMutate).toHaveBeenCalledWith(
      { id: '2', role: 'borrower' },
      expect.any(Object),
    );
  });

  it('shows a one-time password returned by a reset mutation', async () => {
    resetPasswordMutate.mockImplementation((_input, options) => {
      options.onSuccess({ ok: true, temporaryPassword: 'temporary-123' });
    });
    renderPage();
    openUser('Somsri Staff');

    fireEvent.click(screen.getByRole('button', { name: t('admin.users.resetPassword') }));

    await waitFor(() => {
      expect(screen.getByText(new RegExp(`temporary-123`))).toBeInTheDocument();
    });
    expect(resetPasswordMutate).toHaveBeenCalledWith({ id: '2' }, expect.any(Object));
  });

  it('keeps the panel open and surfaces a mutation error instead of claiming success', async () => {
    resetPasswordMutate.mockImplementation((_input, options) => {
      options.onError(new Error('Password reset is unavailable'));
    });
    renderPage();
    openUser('Somsri Staff');

    fireEvent.click(screen.getByRole('button', { name: t('admin.users.resetPassword') }));

    await waitFor(() => {
      expect(screen.getByText('Password reset is unavailable')).toBeInTheDocument();
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('offers activation, not suspension, for a disabled account', () => {
    renderPage();
    openUser('Wichai Disabled');

    expect(screen.getByRole('button', { name: t('admin.users.activate') })).not.toHaveProperty('disabled', true);
    expect(screen.queryByRole('button', { name: t('admin.users.suspend') })).not.toBeInTheDocument();
  });

  it('exports only the currently filtered account rows', () => {
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    renderPage();
    fireEvent.change(screen.getByRole('textbox', { name: t('common.search') }), {
      target: { value: 'Somsri' },
    });

    fireEvent.click(screen.getByRole('button', { name: t('common.export') }));

    expect(window.URL.createObjectURL).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'text/csv;charset=utf-8;' }),
    );
  });

  it('renders an empty table without stale account rows while loading or after a query failure', () => {
    vi.spyOn(adminUsersHooks, 'useAdminUsers').mockReturnValue({
      data: undefined, isLoading: true, isError: false, error: null, refetch: vi.fn(),
    } as never);
    const { rerender } = renderPage();
    expect(screen.queryByText('Somchai Admin')).not.toBeInTheDocument();

    vi.spyOn(adminUsersHooks, 'useAdminUsers').mockReturnValue({
      data: undefined, isLoading: false, isError: true, error: new Error('Network error'), refetch: vi.fn(),
    } as never);
    rerender(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <UsersPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.queryByText('Somchai Admin')).not.toBeInTheDocument();
  });
});
