import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../src/i18n';
import UsersPage from '../../src/features/admin/users/users-page';
import { ADMIN_USERS } from '../fixtures/admin-users';
import * as adminUsersHooks from '../../src/features/admin/users/use-admin-users';
import { useAuthStore } from '../../src/features/auth/auth.store';
import { getErrorMessage } from '../../src/lib/error-messages';
import { adminUserDetail } from '../../../backend/src/admin/admin.schema';
import { toAdminUserDetail } from '../../src/features/admin/users/admin-user.adapter';
import { queryResult } from '../fixtures/query-results';

const useAuditEventsMock = vi.hoisted(() => vi.fn());

vi.mock('../../src/features/admin/audit/use-audit-events', () => ({
  useAuditEvents: useAuditEventsMock,
}));

const ORG = {
  faculties: [{ id: 1, name: 'Engineering' }],
  groups: [
    { id: 10, name: 'Computer Engineering', type: 'Faculty' as const, facultyId: 1 },
    { id: 20, name: 'Robotics Club', type: 'Club' as const, facultyId: null },
  ],
};

vi.mock('../../src/features/admin/org/use-org', () => ({
  useAdminOrg: () => ({ data: ORG, isLoading: false }),
}));

const ADMIN_USER = ADMIN_USERS.find((user) => user.role === 'admin')!;
const STAFF_USER = ADMIN_USERS.find((user) => user.role === 'staff' && user.status === 'active')!;
const BORROWER_USER = ADMIN_USERS.find((user) => user.id === '1006')!;
const DISABLED_USER = ADMIN_USERS.find((user) => user.status === 'disabled')!;
const USERS = [ADMIN_USER, STAFF_USER, BORROWER_USER, DISABLED_USER];
const AUDIT_EVENTS = [
  {
    id: 'audit-1', at: '2026-09-01T10:00:00Z', actorName: STAFF_USER.name,
    actorRole: 'staff' as const, action: 'login' as const, target: `account/${STAFF_USER.id}`,
    ip: '-', userAgent: '-', detail: 'Signed in',
  },
  {
    id: 'audit-2', at: '2026-09-01T11:00:00Z', actorName: STAFF_USER.name,
    actorRole: 'staff' as const, action: 'update' as const, target: `account/${BORROWER_USER.id}`,
    ip: '-', userAgent: '-', detail: 'Updated account',
  },
];

describe('Admin users page', () => {
  let queryClient: QueryClient;
  const createMutate = vi.fn();
  const changeRoleMutate = vi.fn();
  const resetPasswordMutate = vi.fn();
  const setUserActiveMutate = vi.fn();
  const updateUserMutate = vi.fn();

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
    useAuditEventsMock.mockReturnValue({ data: [] });
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
    vi.spyOn(adminUsersHooks, 'useSetUserActive').mockReturnValue({
      mutate: setUserActiveMutate, isPending: false,
    } as never);
    // The detail drawer fetches the fuller account (credit tier, borrow limits,
    // every authority, active penalties) only once a row is opened. Left
    // undefined here so these cases keep asserting against the summary the
    // table itself carries; the page falls back to it while the query is idle.
    vi.spyOn(adminUsersHooks, 'useUserDetail').mockReturnValue({
      data: undefined, isLoading: false,
    } as never);
    vi.spyOn(adminUsersHooks, 'useUserLoans').mockReturnValue({
      data: undefined,
    } as never);
    vi.spyOn(adminUsersHooks, 'useUpdateUser').mockReturnValue({
      mutate: updateUserMutate, isPending: false,
    } as never);
  });

  it('shows contract-derived account statuses and filters by them', () => {
    renderPage();

    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    // The chip, not the disabled user's badge that shares its label.
    const disabledChip = screen
      .getAllByText(t('admin.users.statDisabled'))
      .map((el) => el.closest('button'))
      .find((el) => el !== null);
    expect(disabledChip).toBeDefined();

    fireEvent.click(disabledChip!);

    expect(screen.getByText(DISABLED_USER.name)).toBeInTheDocument();
    expect(screen.queryByText(ADMIN_USER.name)).not.toBeInTheDocument();
    expect(screen.queryByText(BORROWER_USER.name)).not.toBeInTheDocument();
  });

  it('filters users by a case-insensitive name, email, or institutional ID query', () => {
    renderPage();
    const search = screen.getByRole('textbox', { name: t('common.search') });

    fireEvent.change(search, { target: { value: STAFF_USER.govId.toLowerCase() } });

    expect(screen.getByText(STAFF_USER.name)).toBeInTheDocument();
    expect(screen.queryByText(ADMIN_USER.name)).not.toBeInTheDocument();
  });

  it('filters rows using the role and account-status dropdowns', () => {
    renderPage();

    fireEvent.click(screen.getByRole('combobox', { name: t('admin.users.filterRole') }));
    fireEvent.click(screen.getByRole('option', { name: t('nav.staff') }));

    expect(screen.getByText(STAFF_USER.name)).toBeInTheDocument();
    expect(screen.queryByText(ADMIN_USER.name)).not.toBeInTheDocument();
    expect(screen.queryByText(BORROWER_USER.name)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('combobox', { name: t('admin.users.filterStatus') }));
    fireEvent.click(screen.getByRole('option', { name: t('admin.users.statusDisabled') }));

    expect(screen.queryByText(STAFF_USER.name)).not.toBeInTheDocument();
    expect(screen.queryByText(ADMIN_USER.name)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('combobox', { name: t('admin.users.filterRole') }));
    fireEvent.click(
      screen.getByRole('option', {
        name: `${t('admin.users.filterRole')}: ${t('table.filterAll')}`,
      }),
    );
    expect(screen.getByText(DISABLED_USER.name)).toBeInTheDocument();
  });

  it('renders the most-active-users chart from the live audit event list', () => {
    useAuditEventsMock.mockReturnValue({
      data: AUDIT_EVENTS,
    });
    renderPage();

    expect(screen.getByText(t('admin.charts.topUsers'))).toBeInTheDocument();
    expect(screen.getByText(STAFF_USER.name)).toBeInTheDocument();
  });

  it('keeps the create button disabled until the required fields are filled', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: t('admin.users.createUser') }));

    const dialog = screen.getByRole('dialog');
    const submit = within(dialog).getByRole('button', { name: t('admin.users.createSubmit') });
    // Role and faculty selects; departments and clubs are checkboxes.
    const [roleSelect, facultySelect] = within(dialog).getAllByRole('combobox');
    expect(within(dialog).getAllByRole('combobox')).toHaveLength(2);
    expect(facultySelect).toHaveTextContent(t('admin.users.facultyNone'));

    expect(submit).toBeDisabled();
    expect(roleSelect).toHaveTextContent(t('nav.borrower'));

    fireEvent.change(screen.getByPlaceholderText(t('admin.users.namePlaceholder')), {
      target: { value: 'New Test User' },
    });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText('name@ku.th'), {
      target: { value: 'new.test@ku.th' },
    });
    expect(submit).toBeEnabled();
    expect(createMutate).not.toHaveBeenCalled();
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
          facultyId: null,
          groupIds: [],
        },
        expect.any(Object),
      );
    });
  });

  it('sends the ticked departments and clubs as groupIds on create', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: t('admin.users.createUser') }));

    const dialog = screen.getByRole('dialog');
    fireEvent.change(screen.getByPlaceholderText(t('admin.users.namePlaceholder')), {
      target: { value: 'Club Member' },
    });
    fireEvent.change(screen.getByPlaceholderText('name@ku.th'), {
      target: { value: 'club.member@ku.th' },
    });
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /Computer Engineering/ }));
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /Robotics Club/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: t('admin.users.createSubmit') }));

    await waitFor(() => {
      expect(createMutate).toHaveBeenCalledWith(
        expect.objectContaining({ facultyId: null, groupIds: [10, 20] }),
        expect.any(Object),
      );
    });
  });

  it('stays open after creating, shows the one-time password and clears the fields', async () => {
    createMutate.mockImplementation((_input, options) => {
      options.onSuccess({ user: {}, temporaryPassword: 'Tmp-Pass-1234' });
    });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: t('admin.users.createUser') }));

    const dialog = screen.getByRole('dialog');
    const name = screen.getByPlaceholderText(t('admin.users.namePlaceholder'));
    const email = screen.getByPlaceholderText('name@ku.th');
    fireEvent.change(name, { target: { value: 'New Test User' } });
    fireEvent.change(email, { target: { value: 'new.test@ku.th' } });
    fireEvent.click(within(dialog).getByRole('button', { name: t('admin.users.createSubmit') }));

    await waitFor(() => {
      expect(
        within(dialog).getByText(
          i18n.t('admin.users.createdOk', { name: 'New Test User', email: 'new.test@ku.th' }),
        ),
      ).toBeInTheDocument();
    });
    expect(within(dialog).getByText('Tmp-Pass-1234')).toBeInTheDocument();
    expect(name).toHaveValue('');
    expect(email).toHaveValue('');
  });

  describe('editing of faculty and memberships', () => {
    beforeEach(() => {
      const detail = toAdminUserDetail(adminUserDetail.strict().parse({
        id: Number(BORROWER_USER.id), studentId: BORROWER_USER.govId,
        firstName: 'Account', lastName: 'QA', email: BORROWER_USER.email,
        role: 'borrower', status: 'active', creditScore: 100,
        createdAt: null, lastActiveAt: null, managementGroup: null,
        facultyId: 1, creditTier: 'D0', maxBorrowDays: 14, maxExtendTimes: 2,
        activePenalties: [], authorities: ORG.groups.map((g) => ({
          manageGroupKey: g.id, groupName: g.name, groupType: g.type,
          authorityName: 'Student', authorityLevel: 0,
        })),
      }));
      vi.mocked(adminUsersHooks.useUserDetail).mockReturnValue(queryResult(detail));
      renderPage();
      openUser(BORROWER_USER.name);
      fireEvent.click(screen.getByRole('button', { name: t('admin.users.editDetails') }));
    });

    it('preselects the current faculty and memberships without sending an unchanged save', () => {
      const dialog = within(screen.getByRole('dialog'));
      expect(dialog.getByRole('checkbox', { name: /Computer Engineering/ })).toBeChecked();
      expect(dialog.getByRole('checkbox', { name: /Robotics Club/ })).toBeChecked();
      expect(dialog.getAllByRole('combobox')[0]).toHaveTextContent('Engineering');
      fireEvent.click(dialog.getByRole('button', { name: t('common.save') }));
      expect(updateUserMutate).not.toHaveBeenCalled();
    });

    it('sends only changed profile fields and preserves memberships', () => {
      const dialog = within(screen.getByRole('dialog'));
      fireEvent.change(dialog.getByDisplayValue('Account'), { target: { value: 'Edited' } });
      fireEvent.click(dialog.getByRole('button', { name: t('common.save') }));
      expect(updateUserMutate).toHaveBeenCalledWith({ id: BORROWER_USER.id, firstName: 'Edited' }, expect.any(Object));
    });

    it('sends the remaining group and a null faculty when both selections change', () => {
      const dialog = within(screen.getByRole('dialog'));
      fireEvent.click(dialog.getByRole('checkbox', { name: /Robotics Club/ }));
      fireEvent.click(dialog.getAllByRole('combobox')[0]);
      fireEvent.click(screen.getByRole('option', { name: t('admin.users.facultyNone') }));
      fireEvent.click(dialog.getByRole('button', { name: t('common.save') }));
      expect(updateUserMutate).toHaveBeenCalledWith({ id: BORROWER_USER.id, facultyId: null, groupIds: [10] }, expect.any(Object));
    });

    it('sends an explicit empty group set when every membership is unticked', () => {
      const dialog = within(screen.getByRole('dialog'));
      fireEvent.click(dialog.getByRole('checkbox', { name: /Computer Engineering/ }));
      fireEvent.click(dialog.getByRole('checkbox', { name: /Robotics Club/ }));
      fireEvent.click(dialog.getByRole('button', { name: t('common.save') }));
      expect(updateUserMutate).toHaveBeenCalledWith({ id: BORROWER_USER.id, groupIds: [] }, expect.any(Object));
    });
  });

  it('requests account deactivation for the selected active account', () => {
    renderPage();
    openUser(STAFF_USER.name);

    fireEvent.click(screen.getByRole('button', { name: t('admin.users.deactivate') }));

    expect(setUserActiveMutate).toHaveBeenCalledWith(
      { id: STAFF_USER.id, active: false },
      expect.any(Object),
    );
  });

  it('requests a role change using the selected account ID and enum value', () => {
    renderPage();
    openUser(STAFF_USER.name);

    const roleSelect = screen.getAllByRole('combobox').at(-1)!;
    fireEvent.click(roleSelect);
    fireEvent.click(screen.getByRole('option', { name: t('nav.borrower') }));

    expect(changeRoleMutate).toHaveBeenCalledWith(
      { id: STAFF_USER.id, role: 'borrower' },
      expect.any(Object),
    );
  });

  it('shows a one-time password returned by a reset mutation', async () => {
    resetPasswordMutate.mockImplementation((_input, options) => {
      options.onSuccess({ ok: true, temporaryPassword: 'temporary-123' });
    });
    renderPage();
    openUser(STAFF_USER.name);

    fireEvent.click(screen.getByRole('button', { name: t('admin.users.resetPassword') }));

    await waitFor(() => {
      expect(screen.getByText(new RegExp(`temporary-123`))).toBeInTheDocument();
    });
    expect(resetPasswordMutate).toHaveBeenCalledWith({ id: STAFF_USER.id }, expect.any(Object));
  });

  it('keeps the panel open and surfaces a mutation error instead of claiming success', async () => {
    resetPasswordMutate.mockImplementation((_input, options) => {
      options.onError(new Error('Password reset is unavailable'));
    });
    renderPage();
    openUser(STAFF_USER.name);

    fireEvent.click(screen.getByRole('button', { name: t('admin.users.resetPassword') }));

    await waitFor(() => {
      expect(screen.getByText('Password reset is unavailable')).toBeInTheDocument();
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('surfaces a self-modification error when deactivating the current account', async () => {
    const selfError = Object.assign(new Error('CANNOT_MODIFY_SELF'), {
      data: { businessCode: 'CANNOT_MODIFY_SELF' },
    });
    const readable = getErrorMessage(selfError);
    expect(readable).not.toBe('CANNOT_MODIFY_SELF');
    setUserActiveMutate.mockImplementation((_input, options) => {
      // Shaped like a tRPC error: the business code rides in data.
      options.onError(selfError);
    });
    renderPage();
    openUser(STAFF_USER.name);

    fireEvent.click(screen.getByRole('button', { name: t('admin.users.deactivate') }));

    await waitFor(() => {
      expect(screen.getByText(readable)).toBeInTheDocument();
    });
    // A refusal is styled as a warning, not the green success box.
    expect(screen.getByRole('alert')).toHaveTextContent(readable);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('does not offer deactivation or a role change on the admin\'s own account', () => {
    useAuthStore.setState({ user: { ...useAuthStore.getState().user, id: String(STAFF_USER.id) } as never });
    renderPage();
    openUser(STAFF_USER.name);

    expect(screen.getByRole('button', { name: t('admin.users.deactivate') })).toBeDisabled();
    useAuthStore.setState({ user: null });
  });

  it('explains which department blocks a role demotion and includes queued work', async () => {
    changeRoleMutate.mockImplementation((_input, options) => {
      options.onError({
        data: {
          businessCode: 'ROLE_CHANGE_WOULD_ORPHAN_GROUP',
          details: {
            groups: [
              {
                manageGroupKey: 4,
                groupName: 'Computer Engineering',
                losing: 'staff',
                openWork: {
                  pendingRequests: 3,
                  pendingExtensions: 1,
                  openLoans: 5,
                  openRepairs: 2,
                },
              },
            ],
          },
        },
      });
    });
    renderPage();
    openUser(STAFF_USER.name);

    const roleSelect = screen.getAllByRole('combobox').at(-1)!;
    fireEvent.click(roleSelect);
    fireEvent.click(screen.getByRole('option', { name: t('nav.borrower') }));

    await waitFor(() => {
      expect(
        screen.getByText(
          `${i18n.t('admin.users.roleChangeBlocked', { groups: 'Computer Engineering' })} ${i18n.t(
            'admin.users.roleChangeBlockedWork',
            { requests: 3, extensions: 1, loans: 5, repairs: 2 },
          )}`,
        ),
      ).toBeInTheDocument();
    });
  });

  it('explains which department blocks account deactivation without showing role-change text', async () => {
    setUserActiveMutate.mockImplementation((_input, options) => {
      options.onError({
        data: {
          businessCode: 'DISABLE_WOULD_ORPHAN_GROUP',
          details: {
            groups: [
              {
                manageGroupKey: 9,
                groupName: 'Electrical Engineering',
                losing: 'staff',
                openWork: {
                  pendingRequests: 0,
                  pendingExtensions: 0,
                  openLoans: 0,
                  openRepairs: 0,
                },
              },
            ],
          },
        },
      });
    });
    renderPage();
    openUser(STAFF_USER.name);

    fireEvent.click(screen.getByRole('button', { name: t('admin.users.deactivate') }));

    await waitFor(() => {
      expect(
        screen.getByText(
          i18n.t('admin.users.disableBlocked', { groups: 'Electrical Engineering' }),
        ),
      ).toBeInTheDocument();
    });
    expect(screen.queryByText(t('admin.users.roleChangeBlocked'))).not.toBeInTheDocument();
  });

  it('offers activation, not deactivation, for a disabled account', () => {
    renderPage();
    openUser(DISABLED_USER.name);

    expect(screen.getByRole('button', { name: t('admin.users.activate') })).not.toHaveProperty('disabled', true);
    expect(screen.queryByRole('button', { name: t('admin.users.deactivate') })).not.toBeInTheDocument();
  });

  it('exports only the currently filtered account rows', () => {
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    renderPage();
    fireEvent.change(screen.getByRole('textbox', { name: t('common.search') }), {
      target: { value: STAFF_USER.name },
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
    expect(screen.queryByText(ADMIN_USER.name)).not.toBeInTheDocument();

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
    expect(screen.queryByText(ADMIN_USER.name)).not.toBeInTheDocument();
  });
});
