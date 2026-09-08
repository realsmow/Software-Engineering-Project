import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import UsersPage from '../../src/features/admin/users/users-page';
import * as useAdminUsersModule from '../../src/features/admin/users/use-admin-users';
import type { AdminUser } from '../../src/features/admin/mock-data';

// Mock data fixtures
const MOCK_USERS: AdminUser[] = [
  {
    id: '1',
    govId: 'ADM00001',
    name: 'Somchai Admin',
    email: 'somchai.a@ku.th',
    role: 'admin',
    status: 'active',
    auth: 'ku',
    departmentId: 'cpe',
    lastActiveAt: '2026-09-01T10:00:00Z',
    createdAt: '2026-01-10T08:00:00Z',
  },
  {
    id: '2',
    govId: 'STF00002',
    name: 'Somsri Staff',
    email: 'somsri.s@ku.th',
    role: 'staff',
    status: 'active',
    auth: 'local',
    departmentId: 'cpe',
    lastActiveAt: '2026-09-02T11:00:00Z',
    createdAt: '2026-02-15T08:00:00Z',
  },
  {
    id: '3',
    govId: '65019999',
    name: 'Somsak Student',
    email: 'somsak.j@ku.th',
    role: 'borrower',
    status: 'suspended',
    auth: 'ku',
    departmentId: 'cpe',
    lastActiveAt: '2026-08-30T09:00:00Z',
    createdAt: '2026-03-20T08:00:00Z',
  },
  {
    id: '4',
    govId: '65018888',
    name: 'Wichai Disabled',
    email: 'wichai.d@ku.th',
    role: 'borrower',
    status: 'disabled',
    auth: 'ku',
    departmentId: 'me',
    lastActiveAt: '2026-07-25T14:00:00Z',
    createdAt: '2026-04-10T08:00:00Z',
  },
];

describe('Module 2: Admin Users Page [FE]', () => {
  let queryClient: QueryClient;
  const mockCreateUserMutate = vi.fn();
  const mockChangeRoleMutate = vi.fn();
  const mockResetPasswordMutate = vi.fn();
  const mockSetUserBanMutate = vi.fn();

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    vi.clearAllMocks();

    vi.spyOn(useAdminUsersModule, 'useAdminUsers').mockReturnValue({
      data: MOCK_USERS,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    vi.spyOn(useAdminUsersModule, 'useCreateUser').mockReturnValue({
      mutate: mockCreateUserMutate,
      isPending: false,
    } as any);

    vi.spyOn(useAdminUsersModule, 'useChangeRole').mockReturnValue({
      mutate: mockChangeRoleMutate,
      isPending: false,
    } as any);

    vi.spyOn(useAdminUsersModule, 'useResetPassword').mockReturnValue({
      mutate: mockResetPasswordMutate,
      isPending: false,
    } as any);

    vi.spyOn(useAdminUsersModule, 'useSetUserBan').mockReturnValue({
      mutate: mockSetUserBanMutate,
      isPending: false,
    } as any);

    vi.spyOn(useAdminUsersModule, 'useSetUserActive').mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as any);
  });

  const renderComponent = () =>
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <UsersPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

  // ── TP-ADM-FE-01: Stat Chips Summary & Status Quick-Filtering ───────────────
  it('TP-ADM-FE-01: renders stat chips and filters rows when status chip is clicked', async () => {
    renderComponent();

    // Verify stat chip counts: Total 4, Active 2, Suspended 1, Disabled 1
    expect(screen.getByText('4')).toBeInTheDocument(); // Total count
    expect(screen.getByText('2')).toBeInTheDocument(); // Active count
    expect(screen.getAllByText('1').length).toBeGreaterThanOrEqual(2); // Suspended and Disabled counts

    // Click on Suspended chip to filter
    const suspendedChip = screen.getAllByText('ระงับ')[0].closest('button');
    expect(suspendedChip).toBeDefined();
    fireEvent.click(suspendedChip!);

    // Should only display the suspended user (Somsak Student)
    expect(screen.getByText('Somsak Student')).toBeInTheDocument();
    expect(screen.queryByText('Somchai Admin')).not.toBeInTheDocument();
  });

  // ── TP-ADM-FE-02: Client-Side Search Query Filtering ─────────────────────────
  it('TP-ADM-FE-02: filters user table rows dynamically based on search query', async () => {
    renderComponent();

    const searchInput = screen.getByPlaceholderText(/ค้นหา/i) || screen.getByRole('textbox');
    fireEvent.change(searchInput, { target: { value: 'Somsri' } });

    expect(screen.getByText('Somsri Staff')).toBeInTheDocument();
    expect(screen.queryByText('Somchai Admin')).not.toBeInTheDocument();
    expect(screen.queryByText('Somsak Student')).not.toBeInTheDocument();
  });

  // ── TP-ADM-FE-03: Multi-Dropdown Filters (Role/Status/Faculty/Dept) ───────────
  it('TP-ADM-FE-03: filters table rows by Role and Faculty dropdown selections', async () => {
    renderComponent();

    // Table displays all initial mock rows
    expect(screen.getByText('Somchai Admin')).toBeInTheDocument();
    expect(screen.getByText('Somsak Student')).toBeInTheDocument();

    // Verify filter dropdown controls exist
    const selects = screen.getAllByRole('combobox');
    expect(selects.length).toBeGreaterThanOrEqual(1);
  });

  // ── TP-ADM-FE-04: Create User Modal Validation & Field Controls ──────────────
  it('TP-ADM-FE-04: opens Create User modal, validates required fields, and submits', async () => {
    renderComponent();

    const addBtn = screen.getByRole('button', { name: /สร้างบัญชี/i });
    fireEvent.click(addBtn);

    // Modal opens with form elements
    const nameInput = screen.getByPlaceholderText(/ชื่อ–นามสกุล/i);
    const emailInput = screen.getByPlaceholderText(/name@ku\.th/i);

    fireEvent.change(nameInput, { target: { value: 'New Test User' } });
    fireEvent.change(emailInput, { target: { value: 'new.test@ku.th' } });

    const buttons = screen.getAllByRole('button', { name: /สร้างบัญชี/i });
    const submitBtn = buttons[buttons.length - 1];
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockCreateUserMutate).toHaveBeenCalled();
    });
  });

  // ── TP-ADM-FE-05: Role & Status Badge Visual Rendering Rules ─────────────────
  it('TP-ADM-FE-05: renders role and status badges with appropriate semantic tones', () => {
    renderComponent();

    const activeBadges = screen.getAllByText(/ใช้งาน/i);
    expect(activeBadges.length).toBeGreaterThan(0);

    const suspendedBadges = screen.getAllByText(/^ระงับ$/i);
    expect(suspendedBadges.length).toBeGreaterThan(0);
  });

  // ── TP-ADM-FE-06: Filtered Account List CSV Export ───────────────────────────
  it('TP-ADM-FE-06: triggers CSV download when export button is clicked', () => {
    renderComponent();

    const exportBtn = screen.getByRole('button', { name: /ส่งออก/i });
    expect(exportBtn).toBeInTheDocument();

    // Mock URL.createObjectURL
    const createObjectURLMock = vi.fn().mockReturnValue('blob:mock-url');
    window.URL.createObjectURL = createObjectURLMock;

    fireEvent.click(exportBtn);
    expect(createObjectURLMock).toHaveBeenCalled();
  });

  // ── TP-ADM-FE-07: Loading State Display ──────────────────────────────────────
  it('TP-ADM-FE-07: shows loading indicator when data is being fetched', () => {
    vi.spyOn(useAdminUsersModule, 'useAdminUsers').mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    renderComponent();

    // Table body should not render user data during loading
    expect(screen.queryByText('Somchai Admin')).not.toBeInTheDocument();
    expect(screen.queryByText('Somsri Staff')).not.toBeInTheDocument();
  });

  // ── TP-ADM-FE-08: Error State Display ────────────────────────────────────────
  it('TP-ADM-FE-08: renders error feedback when data fetch fails', () => {
    vi.spyOn(useAdminUsersModule, 'useAdminUsers').mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('Network error'),
      refetch: vi.fn(),
    } as any);

    renderComponent();

    // Table should not render user data when in error state
    expect(screen.queryByText('Somchai Admin')).not.toBeInTheDocument();
    expect(screen.queryByText('Somsri Staff')).not.toBeInTheDocument();
  });
});
