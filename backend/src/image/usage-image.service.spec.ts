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

function build(
  usage: unknown,
  existing: { ImageURL: string }[] = [],
  // Null means "no appealable damage penalty on this loan" - the default,
  // since most cases here have nothing to do with evidence.
  appealablePenalty: { PenaltyKey: number } | null = null,
) {
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
    penaltyInfo: {
      findFirst: jest.fn().mockResolvedValue(appealablePenalty),
    },
  } as unknown as PrismaService;

  const scope = {
    assertResourceInScope: jest.fn().mockResolvedValue(undefined),
  } as unknown as StaffScopeService;

  // `createMany` is handed back separately rather than read off `prisma`: the
  // assertions want the mock itself, and pulling a method off the object to
  // pass to `expect` detaches it from its receiver.
  // `list()` (and everything that ends with it) now signs evidence URLs on
  // the way out (NFR-SEC-06) via `toPublicUrl`, so it needs a stub here too -
  // a passthrough, since these cases don't care about the signing itself,
  // only that a URL comes back.
  const images = {
    issueTicket: jest.fn(),
    toPublicUrl: jest.fn((value: string | null | undefined) => value ?? null),
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
 * Appeal evidence (FR-APL-02).
 *
 * Not gated by `CurrentStatus` like before/after - a damage grade only exists
 * once a loan is well past `Lended`, so the window here is "is there a damage
 * penalty worth arguing with", checked against `PenaltyInfo` instead.
 */
describe('UsageImageService.attach (evidence)', () => {
  const photos = {
    usageKey: 7,
    stage: 'evidence' as const,
    imageUrls: ['/media/a.jpg'],
  };

  it('attaches evidence while a damage penalty is still appealable', async () => {
    const { service, createMany } = build(usage('Returned'), [], {
      PenaltyKey: 9,
    });

    await service.attach(BORROWER, photos);

    expect(createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ SubmissionType: 'AppealEvidence' })],
    });
  });

  it('refuses evidence when there is no damage penalty to argue with', async () => {
    const { service } = build(usage('Returned'), [], null);

    await expect(service.attach(BORROWER, photos)).rejects.toThrow(
      /EVIDENCE_NOT_ALLOWED/,
    );
  });

  it('ignores loan state entirely - a "Lended" loan with an appealable penalty still qualifies', async () => {
    // Contrived (a damage grade normally postdates the loan), but the point is
    // that STAGE_ALLOWED_STATES, which would refuse "Lended" for before/after,
    // is never consulted for this stage.
    const { service, createMany } = build(usage('Lended'), [], {
      PenaltyKey: 9,
    });

    await service.attach(BORROWER, photos);

    expect(createMany).toHaveBeenCalled();
  });

  it('refuses staff even when the loan is in their scope', async () => {
    // The penalty query filters by the caller's own account key, so a staff
    // member's key simply matches nothing - no separate role check needed.
    const { service } = build(usage('Returned', 999), [], null);

    await expect(service.attach(STAFF, photos)).rejects.toThrow(
      /EVIDENCE_NOT_ALLOWED/,
    );
  });
});

describe('UsageImageService.detach (evidence)', () => {
  it('lets the borrower remove their own evidence while still appealable', async () => {
    const { service } = build(usage('Returned'), [], { PenaltyKey: 9 });
    const prisma = (
      service as unknown as {
        prisma: { images: { findUnique: jest.Mock; delete: jest.Mock } };
      }
    ).prisma;
    prisma.images.findUnique.mockResolvedValue({
      ImageKey: 1,
      ImageURL: '/media/a.jpg',
      SubmissionType: 'AppealEvidence',
      SubmittedBy: BORROWER.accountKey,
      ActionTime: new Date(),
      UsageKey: 7,
    });

    await service.detach(BORROWER, 1);

    expect(prisma.images.delete).toHaveBeenCalledWith({
      where: { ImageKey: 1 },
    });
  });

  it('refuses to remove evidence once nothing is left to appeal', async () => {
    const { service } = build(usage('Returned'), [], null);
    const prisma = (
      service as unknown as { prisma: { images: { findUnique: jest.Mock } } }
    ).prisma;
    prisma.images.findUnique.mockResolvedValue({
      ImageKey: 1,
      ImageURL: '/media/a.jpg',
      SubmissionType: 'AppealEvidence',
      SubmittedBy: BORROWER.accountKey,
      ActionTime: new Date(),
      UsageKey: 7,
    });

    await expect(service.detach(BORROWER, 1)).rejects.toThrow(
      /EVIDENCE_NOT_ALLOWED/,
    );
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
  const ask = {
    usageKey: 7,
    contentType: 'image/png' as const,
    sizeBytes: 1024,
  };

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
