import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../src/i18n';
import StaffInspectionPage from '../../src/features/staff/inspection/inspection-page';
import type {
  InspectionQueueRow,
  InspectionSubject,
} from '../../src/features/staff/inspection/inspection.types';

const hooks = vi.hoisted(() => ({
  useInspectionQueue: vi.fn(),
  useInspectionSubject: vi.fn(),
  useCreateInspection: vi.fn(),
}));

vi.mock('../../src/features/staff/inspection/use-inspection', () => hooks);

const row: InspectionQueueRow = {
  usageKey: 42,
  borrowerName: 'Ada Lovelace',
  borrowerStudentId: 'S12345',
  itemName: 'Oscilloscope',
  serialNo: 'OSC-001',
  resourceKey: 7,
  tier: 'T2',
  checkoutCondition: 'Normal',
  returnedAt: '2026-09-25T09:00:00.000Z',
  overdueDays: 0,
  beforeImageCount: 1,
  afterImageCount: 1,
};

const subject: InspectionSubject = {
  usageKey: 42,
  resourceKey: 7,
  itemName: 'Oscilloscope',
  serialNo: 'OSC-001',
  tier: 'T2',
  creditWeight: 12,
  borrowerAccountKey: 10,
  borrowerName: 'Ada Lovelace',
  borrowerStudentId: 'S12345',
  borrowerCreditScore: 88,
  checkoutCondition: 'Normal',
  checkoutConditionNote: 'No marks at handover',
  checkoutAt: '2026-09-23T10:00:00.000Z',
  dueAt: '2026-09-25T10:00:00.000Z',
  returnedAt: '2026-09-25T09:00:00.000Z',
  overdueDays: 0,
  beforeImages: [{ imageKey: 1, url: '/media/before.jpg', submittedAt: null }],
  afterImages: [{ imageKey: 2, url: '/media/after.jpg', submittedAt: null }],
  unitHistory: [{
    conditionKey: 5,
    condition: 'MinorDamage',
    note: 'Old scratch',
    loggedAt: '2026-08-25T10:00:00.000Z',
  }],
  existingInspectionKey: null,
};

describe('StaffInspectionPage', () => {
  const create = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    void i18n.changeLanguage('en');
    hooks.useInspectionQueue.mockReturnValue({ data: [row], isLoading: false });
    hooks.useInspectionSubject.mockReturnValue({ data: subject, isLoading: false });
    hooks.useCreateInspection.mockReturnValue({ mutateAsync: create, isPending: false });
  });

  it('shows the returned-item backlog and loads detail only when opened', () => {
    const { container } = render(<StaffInspectionPage />);

    expect(screen.getByText('Oscilloscope')).toBeInTheDocument();
    expect(hooks.useInspectionSubject).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Oscilloscope/ }));
    expect(hooks.useInspectionSubject).toHaveBeenCalledWith(42);
    expect(screen.getByText(i18n.t('staff.inspection.atHandover'))).toBeInTheDocument();
    expect(screen.getByText(i18n.t('staff.inspection.atReturn'))).toBeInTheDocument();
    expect(Array.from(container.querySelectorAll('img')).map((image) => image.getAttribute('src')))
      .toEqual(['/media/before.jpg', '/media/after.jpg']);
    expect(screen.getByText('Old scratch')).toBeInTheDocument();
  });

  it('requires a grade and submits the selected condition with the note', async () => {
    create.mockResolvedValue({ level: 'B2', penalty: { creditDeducted: 36 }, returnedToPool: false });
    render(<StaffInspectionPage />);
    fireEvent.click(screen.getByRole('button', { name: /Oscilloscope/ }));

    fireEvent.click(screen.getByRole('button', { name: i18n.t('staff.inspection.recordGrade') }));
    expect(screen.getByText(i18n.t('staff.inspection.pickGrade'))).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /B2/ }));
    fireEvent.change(screen.getByPlaceholderText(i18n.t('staff.inspection.notePlaceholder')), {
      target: { value: 'Screen cracked' },
    });
    fireEvent.click(screen.getByRole('button', { name: i18n.t('staff.inspection.recordGrade') }));

    await waitFor(() => expect(create).toHaveBeenCalledWith({
      usageKey: 42,
      level: 'B2',
      note: 'Screen cracked',
    }));
    expect(screen.getByText(/36/)).toBeInTheDocument();
  });

  it('does not offer a second grade when the server says the return was inspected', () => {
    hooks.useInspectionSubject.mockReturnValue({
      data: { ...subject, existingInspectionKey: 13 },
      isLoading: false,
    });
    render(<StaffInspectionPage />);
    fireEvent.click(screen.getByRole('button', { name: /Oscilloscope/ }));

    expect(screen.getByText(i18n.t('staff.inspection.alreadyGraded', { key: 13 }))).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: i18n.t('staff.inspection.recordGrade') })).not.toBeInTheDocument();
  });
});
