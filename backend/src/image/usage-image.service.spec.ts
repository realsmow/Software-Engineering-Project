import { UsageImageService } from './usage-image.service';
import type { StaffScopeService } from '../common/authority/staff-scope.service';
import type { ImageService } from './image.service';
import type { PrismaService } from '../prisma.service';
import type { TrpcUser } from '../trpc/context';

/**
 * Check-in / check-out photos (§5.9).
 *
 * The stage windows are the part worth pinning down. A "before" photo filed
 * after the loan ran is a photo of the condition it came back in, stored under
 * the heading that says it left that way — and the pair only means anything to
 * an appeal if each side was taken when it claims to have been.
 */

const BORROWER: TrpcUser = {
  accountKey: 100,
  role: 'borrower',
  creditScore: 60,
} as TrpcUser;

const STAFF: TrpcUser = {
  accountKey: 200,
  role: 'staff',
  creditScore: 100,
} as TrpcUser;

function build(usage: unknown, existing: { ImageURL: string }[] = []) {
  const createMany = jest.fn().mockResolvedValue({ count: 1 });

  const prisma = {
    usageLog: { findUnique: jest.fn().mockResolvedValue(usage) },
    images: {
      findMany: jest
        .fn()
        // `attach` reads the stage's existing URLs, then `list` reads them all.
        .mockResolvedValueOnce(existing)
        .mockResolvedValue([]),
      createMany,
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
  } as unknown as PrismaService;

  const scope = {
    assertResourceInScope: jest.fn().mockResolvedValue(undefined),
  } as unknown as StaffScopeService;

  // `createMany` is handed back separately rather than read off `prisma`: the
  // assertions want the mock itself, and pulling a method off the object to
  // pass to `expect` detaches it from its receiver.
  // Only the ticket path touches ImageService, and these cases do not take it.
  const images = {
    issueTicket: jest.fn(),
  } as unknown as ImageService;

  return {
    service: new UsageImageService(prisma, scope, images),
    createMany,
    issueTicket: images.issueTicket as jest.Mock,
  };
}

const usage = (status: string, accountKey = BORROWER.accountKey) => ({
  UsageKey: 7,
  AccountKey: accountKey,
  ResourceKey: 42,
  CurrentStatus: status,
});

describe('UsageImageService.attach', () => {
  const photos = { usageKey: 7, imageUrls: ['/media/a.jpg'] };

  it('takes "before" photos while the unit is on the counter', async () => {
    const { service, createMany } = build(usage('Prepared'));

    await service.attach(BORROWER, { ...photos, stage: 'before' });

    expect(createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ SubmissionType: 'BeforePicture' })],
    });
  });

  it('refuses "before" photos once the loan is over', async () => {
    const { service } = build(usage('Returned'));

    await expect(
      service.attach(BORROWER, { ...photos, stage: 'before' }),
    ).rejects.toThrow(/WRONG_LOAN_STATE/);
  });

  it('refuses anything once a grade has been recorded', async () => {
    // After inspection the evidence is closed; disagreement goes to an appeal.
    const { service } = build(usage('Inspected'));

    await expect(
      service.attach(BORROWER, { ...photos, stage: 'after' }),
    ).rejects.toThrow(/WRONG_LOAN_STATE/);
  });

  it('does not store a photo twice when the client retries', async () => {
    const { service, createMany } = build(usage('Lended'), [
      { ImageURL: '/media/a.jpg' },
    ]);

    await service.attach(BORROWER, { ...photos, stage: 'after' });

    expect(createMany).not.toHaveBeenCalled();
  });

  it('refuses more than the per-stage cap', async () => {
    const existing = Array.from({ length: 10 }, (_, i) => ({
      ImageURL: `/media/${i}.jpg`,
    }));
    const { service } = build(usage('Lended'), existing);

    await expect(
      service.attach(BORROWER, {
        usageKey: 7,
        stage: 'after',
        imageUrls: ['/media/new.jpg'],
      }),
    ).rejects.toThrow(/TOO_MANY_PHOTOS/);
  });

  it('hides somebody else’s loan behind the same answer as a missing one', async () => {
    const { service } = build(usage('Lended', 999));

    await expect(
      service.attach(BORROWER, { ...photos, stage: 'after' }),
    ).rejects.toThrow(/LOAN_NOT_FOUND/);
  });

  it('lets staff file against a loan their department manages', async () => {
    const { service, createMany } = build(usage('Lended', 999));

    await service.attach(STAFF, { ...photos, stage: 'after' });

    expect(createMany).toHaveBeenCalled();
  });
});

/**
 * The borrower's upload ticket.
 *
 * `image.requestUpload` is staff-only on purpose, so this is the only way a
 * borrower gets an upload URL at all. Two things have to hold: the loan is
 * theirs, and they cannot steer the ticket at anything but loan evidence.
 */
describe('UsageImageService.requestUploadTicket', () => {
  const ask = { usageKey: 7, contentType: 'image/png' as const, sizeBytes: 1024 };

  it('issues a ticket for a loan the borrower owns', async () => {
    const { service, issueTicket } = build(usage('Lended'));
    issueTicket.mockReturnValue({ uploadUrl: 'u', imageUrl: '/media/x.png' });

    await service.requestUploadTicket(BORROWER, ask);

    expect(issueTicket).toHaveBeenCalledTimes(1);
  });

  it('fixes the purpose, so a borrower cannot aim a ticket at the catalogue', async () => {
    const { service, issueTicket } = build(usage('Lended'));
    issueTicket.mockReturnValue({ uploadUrl: 'u', imageUrl: '/media/x.png' });

    await service.requestUploadTicket(BORROWER, ask);

    expect(issueTicket).toHaveBeenCalledWith(
      expect.objectContaining({ purpose: 'inspection' }),
      BORROWER.accountKey,
    );
  });

  it('hides somebody else’s loan behind the same answer as a missing one', async () => {
    const { service, issueTicket } = build(usage('Lended', 999));

    await expect(service.requestUploadTicket(BORROWER, ask)).rejects.toThrow(
      'LOAN_NOT_FOUND',
    );
    // Refused before a ticket exists, not after one was handed out.
    expect(issueTicket).not.toHaveBeenCalled();
  });

  it('refuses a loan that does not exist', async () => {
    const { service, issueTicket } = build(null);

    await expect(service.requestUploadTicket(BORROWER, ask)).rejects.toThrow(
      'LOAN_NOT_FOUND',
    );
    expect(issueTicket).not.toHaveBeenCalled();
  });
});
