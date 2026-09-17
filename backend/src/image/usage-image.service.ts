import { Injectable } from '@nestjs/common';
import type { SubmissionType } from '../generated/prisma/enums';
import { PrismaService } from '../prisma.service';
import { StaffScopeService } from '../common/authority/staff-scope.service';
import { BusinessError } from '../common/errors/business-error';
import { toIsoNullable } from '../common/schemas/datetime.schema';
import type { TrpcUser } from '../trpc/context';
import {
  MAX_PHOTOS_PER_STAGE,
  type AttachUsagePhotosInput,
  type UsagePhotoStage,
} from './image.schema';

/** Wire stage -> the column's enum. `InspectionPicture` is not reachable here. */
const STAGE_TO_DB: Record<UsagePhotoStage, SubmissionType> = {
  before: 'BeforePicture',
  after: 'AfterPicture',
};

const DB_TO_STAGE: Record<SubmissionType, 'before' | 'after' | 'inspection'> = {
  BeforePicture: 'before',
  AfterPicture: 'after',
  InspectionPicture: 'inspection',
};

/**
 * When each stage may still be photographed, by `UsageLog.CurrentStatus`.
 *
 * `before` closes when the thing is handed over and `after` opens when it is:
 * a "before" photo taken after the loan ran is not a record of the condition
 * it left in, it is a record of the condition it came back in, filed under the
 * wrong heading — and the whole point of the pair is that an inspection can be
 * argued with by comparing them.
 *
 * `Lended` is in both because the two moments bracket it: staff hand the unit
 * over and the borrower photographs it there at the counter, and the same row
 * is still `Lended` when they bring it back before anyone has recorded the
 * return.
 *
 * `Inspected` is in neither. Once a grade is recorded the evidence is closed;
 * a borrower who disagrees files an appeal (§5.8), which is a different desk
 * and leaves a different trail.
 */
const STAGE_ALLOWED_STATES: Record<UsagePhotoStage, readonly string[]> = {
  before: ['Prepared', 'Lended'],
  after: ['Lended', 'Returned'],
};

const PHOTO_SELECT = {
  ImageKey: true,
  ImageURL: true,
  SubmissionType: true,
  SubmittedBy: true,
  ActionTime: true,
} as const;

/**
 * Check-in / check-out photos (§5.9 "บันทึกภาพก่อน-หลังการใช้งาน").
 *
 * Separate from `ImageService` on purpose: that one signs upload tickets and
 * writes bytes to disk and has never needed a database. This one only ever
 * writes `Images` rows, because the bytes are the frontend's job now — the
 * team settled that on 2026-09-16, and the two services would otherwise be a
 * filesystem and a table sharing one class for no reason.
 */
@Injectable()
export class UsageImageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: StaffScopeService,
  ) {}

  /**
   * Record photos against a loan.
   *
   * Idempotent per URL: sending the same list twice does not double the rows.
   * The frontend retries an upload confirmation on a flaky connection, and a
   * second copy of a photo in the return evidence is the kind of thing an
   * appeal argues over.
   */
  async attach(user: TrpcUser, input: AttachUsagePhotosInput) {
    const usage = await this.loadUsage(user, input.usageKey);

    if (!STAGE_ALLOWED_STATES[input.stage].includes(usage.CurrentStatus)) {
      throw new BusinessError('WRONG_LOAN_STATE', {
        usageKey: input.usageKey,
        status: usage.CurrentStatus,
        stage: input.stage,
        allowed: STAGE_ALLOWED_STATES[input.stage],
      });
    }

    const submissionType = STAGE_TO_DB[input.stage];

    const existing = await this.prisma.images.findMany({
      where: { UsageKey: input.usageKey, SubmissionType: submissionType },
      select: { ImageURL: true },
    });
    const already = new Set(existing.map((row) => row.ImageURL));
    const fresh = [...new Set(input.imageUrls)].filter(
      (url) => !already.has(url),
    );

    if (already.size + fresh.length > MAX_PHOTOS_PER_STAGE) {
      throw new BusinessError('TOO_MANY_PHOTOS', {
        usageKey: input.usageKey,
        stage: input.stage,
        existing: already.size,
        adding: fresh.length,
        max: MAX_PHOTOS_PER_STAGE,
      });
    }

    if (fresh.length > 0) {
      await this.prisma.images.createMany({
        data: fresh.map((url) => ({
          SubmittedBy: user.accountKey,
          UsageKey: input.usageKey,
          ResourceKey: usage.ResourceKey,
          ImageURL: url,
          SubmissionType: submissionType,
          ActionTime: new Date(),
        })),
      });
    }

    return this.list(user, input.usageKey);
  }

  /** Both sides of one loan, plus whatever the inspector filed. */
  async list(user: TrpcUser, usageKey: number) {
    await this.loadUsage(user, usageKey);

    const rows = await this.prisma.images.findMany({
      where: { UsageKey: usageKey },
      select: PHOTO_SELECT,
      orderBy: { ImageKey: 'asc' },
    });

    const grouped = { before: [], after: [], inspection: [] } as Record<
      'before' | 'after' | 'inspection',
      Array<{
        imageKey: number;
        imageUrl: string;
        stage: 'before' | 'after' | 'inspection';
        submittedBy: number;
        submittedAt: string | null;
      }>
    >;

    for (const row of rows) {
      const stage = DB_TO_STAGE[row.SubmissionType];
      grouped[stage].push({
        imageKey: row.ImageKey,
        imageUrl: row.ImageURL,
        stage,
        submittedBy: row.SubmittedBy,
        submittedAt: toIsoNullable(row.ActionTime),
      });
    }

    return grouped;
  }

  /**
   * Remove a photo.
   *
   * Only by whoever filed it, and only while the stage it belongs to is still
   * open — the same window `attach` uses. After that the photo is evidence:
   * a borrower who could delete their "after" photos once a grade was recorded
   * could remove the record of damage they are being charged for, and an
   * inspector who could delete theirs could remove the justification.
   *
   * `InspectionPicture` has no open window here at all, so this refuses it
   * outright: those are removed, if ever, by re-doing the inspection.
   */
  async detach(user: TrpcUser, imageKey: number) {
    const image = await this.prisma.images.findUnique({
      where: { ImageKey: imageKey },
      select: { ...PHOTO_SELECT, UsageKey: true },
    });

    if (!image) {
      throw new BusinessError('IMAGE_NOT_FOUND', { imageKey });
    }
    if (image.SubmittedBy !== user.accountKey) {
      throw new BusinessError('NOT_YOUR_PHOTO', { imageKey });
    }

    const stage = DB_TO_STAGE[image.SubmissionType];
    if (stage === 'inspection') {
      throw new BusinessError('WRONG_LOAN_STATE', {
        imageKey,
        stage,
        note: 'inspection photos are removed by re-grading, not here',
      });
    }

    const usage = await this.loadUsage(user, image.UsageKey);
    if (!STAGE_ALLOWED_STATES[stage].includes(usage.CurrentStatus)) {
      throw new BusinessError('WRONG_LOAN_STATE', {
        imageKey,
        status: usage.CurrentStatus,
        stage,
        allowed: STAGE_ALLOWED_STATES[stage],
      });
    }

    await this.prisma.images.delete({ where: { ImageKey: imageKey } });

    return this.list(user, image.UsageKey);
  }

  /**
   * The loan, and the caller's right to touch it.
   *
   * Two ways in, because both people stand at the counter: the borrower whose
   * loan it is, and staff whose department manages the unit. Staff are scoped
   * the same way every other staff write is — holding the role is not the same
   * as being allowed to file evidence against another department's equipment.
   */
  private async loadUsage(user: TrpcUser, usageKey: number) {
    const usage = await this.prisma.usageLog.findUnique({
      where: { UsageKey: usageKey },
      select: {
        UsageKey: true,
        AccountKey: true,
        ResourceKey: true,
        CurrentStatus: true,
      },
    });

    if (!usage) {
      throw new BusinessError('LOAN_NOT_FOUND', { usageKey });
    }

    if (usage.AccountKey === user.accountKey) return usage;

    if (user.role === 'borrower') {
      // Same answer as "no such loan": a borrower must not be able to tell
      // which keys belong to somebody else's loans.
      throw new BusinessError('LOAN_NOT_FOUND', { usageKey });
    }

    await this.scope.assertResourceInScope(user, usage.ResourceKey);
    return usage;
  }
}
