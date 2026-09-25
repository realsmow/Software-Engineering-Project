import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../src/i18n';
import SupervisorApprovalsPage from '../../src/features/supervisor/approvals/approvals-queue-page';
import type {
  ApprovalQueueRow,
  ExtensionReviewRow,
} from '../../src/features/supervisor/approvals/approval.types';

const hooks = vi.hoisted(() => ({
  useApprovalCounts: vi.fn(),
  useApprovalQueue: vi.fn(),
  useDecideApproval: vi.fn(),
  useExtensionQueue: vi.fn(),
  useDecideExtension: vi.fn(),
}));

vi.mock('../../src/features/supervisor/approvals/use-approvals', () => hooks);

const borrower = {
  accountKey: 42,
  studentId: 'S12345',
  firstName: 'Ada',
  lastName: 'Lovelace',
  creditScore: 72,
};

const request: ApprovalQueueRow = {
  reservationKey: 77,
  requestedAt: '2026-09-24T08:00:00.000Z',
  borrower,
  creditTier: 'D2',
  route: 'supervisor',
  resourceKey: 7,
  itemName: 'Oscilloscope',
  serialNo: 'OSC-001',
  kind: 'equipment',
  tier: 'T2',
  startTime: '2026-10-01T06:00:00.000Z',
  endTime: '2026-10-02T06:00:00.000Z',
  requestedDays: 2,
  reason: 'Lab project',
  clashesWith: [],
};

const extension: ExtensionReviewRow = {
  extensionKey: 12,
  usageKey: 9,
  borrower,
  creditTier: 'D2',
  route: 'supervisor',
  itemName: 'Oscilloscope',
  serialNo: 'OSC-001',
  tier: 'T2',
  extendNo: 1,
  previousDueAt: '2026-10-02T06:00:00.000Z',
  requestedDueAt: '2026-10-03T06:00:00.000Z',
  requestedAt: '2026-09-24T08:00:00.000Z',
  reason: null,
  status: 'Pending',
};

describe('SupervisorApprovalsPage', () => {
  const decide = vi.fn();
  const decideExtension = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    void i18n.changeLanguage('en');
    hooks.useApprovalCounts.mockReturnValue({
      data: { staff: 0, supervisor: 1, overdueToDecide: 0, autoApprovedToday: 0 },
    });
    hooks.useApprovalQueue.mockReturnValue({ data: [request], isLoading: false });
    hooks.useExtensionQueue.mockReturnValue({ data: [extension], isLoading: false });
    hooks.useDecideApproval.mockReturnValue({ mutateAsync: decide });
    hooks.useDecideExtension.mockReturnValue({ mutateAsync: decideExtension });
  });

  it('shows the scoped queue with borrower credit and a server-side search', () => {
    render(<SupervisorApprovalsPage />);

    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText(/S12345.*D2.*72/)).toBeInTheDocument();
    expect(screen.getByText('Oscilloscope')).toBeInTheDocument();
    expect(hooks.useApprovalQueue).toHaveBeenCalledWith(undefined, '');

    fireEvent.change(screen.getByPlaceholderText(i18n.t('supervisor.approvals.searchPlaceholder')), {
      target: { value: 'Ada' },
    });
    expect(hooks.useApprovalQueue).toHaveBeenLastCalledWith(undefined, 'Ada');
  });

  it('requires a reason before rejecting and passes it to the decision mutation', async () => {
    decide.mockResolvedValue({ request: { reservationKey: 77 }, cancelled: [] });
    render(<SupervisorApprovalsPage />);

    fireEvent.click(screen.getByRole('button', { name: i18n.t('supervisor.approvals.reject') }));
    const confirm = screen.getByRole('button', { name: i18n.t('supervisor.approvals.confirmReject') });
    expect(confirm).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText(i18n.t('supervisor.approvals.reasonPlaceholder')), {
      target: { value: 'Unavailable for the requested dates' },
    });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);

    await waitFor(() =>
      expect(decide).toHaveBeenCalledWith({
        reservationKey: 77,
        decision: 'reject',
        reason: 'Unavailable for the requested dates',
      }),
    );
  });

  it('asks before approving a request that would cancel a competing request', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    hooks.useApprovalQueue.mockReturnValue({
      data: [{ ...request, clashesWith: [{
        reservationKey: 78,
        borrowerName: 'Grace Hopper',
        startTime: request.startTime,
        endTime: request.endTime,
      }] }],
      isLoading: false,
    });
    render(<SupervisorApprovalsPage />);

    fireEvent.click(screen.getByRole('button', { name: i18n.t('supervisor.approvals.approve') }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(decide).not.toHaveBeenCalled();
    confirm.mockRestore();
  });

  it('submits the selected condition with a supervisor extension decision', async () => {
    decideExtension.mockResolvedValue({ extensionKey: 12, status: 'Approved' });
    render(<SupervisorApprovalsPage />);

    fireEvent.click(screen.getByText(i18n.t('supervisor.approvals.viewExtensions')));
    const row = screen.getByText('Oscilloscope').closest('tr');
    expect(row).not.toBeNull();
    fireEvent.change(within(row!).getByRole('combobox'), { target: { value: 'MinorDamage' } });
    fireEvent.click(within(row!).getByRole('button', { name: i18n.t('supervisor.approvals.approve') }));

    await waitFor(() =>
      expect(decideExtension).toHaveBeenCalledWith({
        extensionKey: 12,
        decision: 'approve',
        condition: 'MinorDamage',
      }),
    );
  });
});
