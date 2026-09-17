import {
  Ctx,
  Input,
  Mutation,
  Query,
  Router,
  UseMiddlewares,
} from 'nestjs-trpc';
import { AuthMiddleware, StaffMiddleware } from '../trpc/auth.middleware';
import type { TrpcContext } from '../trpc/context';
import {
  attachUsagePhotosInput,
  detachUsagePhotoInput,
  requestUploadInput,
  requestUploadOutput,
  requestUsagePhotoUploadInput,
  type RequestUsagePhotoUploadInput,
  usagePhotosInput,
  usagePhotosOutput,
  type AttachUsagePhotosInput,
  type DetachUsagePhotoInput,
  type RequestUploadInput,
} from './image.schema';
import { ImageService } from './image.service';
import { UsageImageService } from './usage-image.service';

/**
 * Step 1 of the upload flow (CONTRACT.md §3). Step 2 is not a tRPC procedure at
 * all — it is the raw `PUT` handled by ImageController.
 *
 * Staff-gated because every `uploadPurpose` defined so far is a staff one. The
 * borrower slice adds `loanBefore` / `loanAfter`, and when it does this router
 * has to drop to AuthMiddleware and check the purpose per caller — a borrower
 * may upload against their own loan and nothing else. Leaving the gate at
 * StaffMiddleware until then keeps that decision from being made by accident.
 */
@Router({ alias: 'image' })
export class ImageRouter {
  constructor(
    private readonly imageService: ImageService,
    private readonly usageImages: UsageImageService,
  ) {}

  /**
   * Issues a short-lived, signed URL to PUT one file at.
   *
   * Returns `imageUrl` as the relative `/media/...` path — that is the value to
   * hand to `item.createType`, `item.createUnit`, `item.createRoom` or
   * `inspection.create`. `previewUrl` is the same file, absolute, for showing
   * it before the record is saved.
   */
  @UseMiddlewares(StaffMiddleware)
  @Mutation({ input: requestUploadInput, output: requestUploadOutput })
  requestUpload(@Input() input: RequestUploadInput, @Ctx() ctx: TrpcContext) {
    return this.imageService.issueTicket(input, ctx.user!.accountKey);
  }

  // ── Check-in / check-out photos (§5.9) ──────────────────────────────────
  //
  // `AuthMiddleware`, not `StaffMiddleware`: these are the borrower's own
  // photos of their own loan. Who may touch which loan is a per-row question
  // — the borrower who holds it, or staff whose department manages the unit —
  // and UsageImageService.loadUsage is where it is answered.

  /** File the photos the frontend has already uploaded, at one stage. */
  /**
   * The borrower's way to get an upload URL, for their own loan only.
   *
   * Separate from `requestUpload` rather than dropping that one to
   * AuthMiddleware and branching on `purpose`: the staff path keeps its gate
   * untouched, and there is no branch here for a bug to get wrong. The loan is
   * checked for ownership before a ticket exists, and `purpose` is not a
   * parameter, so this cannot be aimed at the catalogue or a room.
   */
  @UseMiddlewares(AuthMiddleware)
  @Mutation({
    input: requestUsagePhotoUploadInput,
    output: requestUploadOutput,
  })
  requestUsagePhotoUpload(
    @Input() input: RequestUsagePhotoUploadInput,
    @Ctx() ctx: TrpcContext,
  ) {
    return this.usageImages.requestUploadTicket(ctx.user!, input);
  }

  @UseMiddlewares(AuthMiddleware)
  @Mutation({ input: attachUsagePhotosInput, output: usagePhotosOutput })
  attachUsagePhotos(
    @Input() input: AttachUsagePhotosInput,
    @Ctx() ctx: TrpcContext,
  ) {
    return this.usageImages.attach(ctx.user!, input);
  }

  /** Before, after and inspection photos of one loan. */
  @UseMiddlewares(AuthMiddleware)
  @Query({ input: usagePhotosInput, output: usagePhotosOutput })
  usagePhotos(@Input() input: { usageKey: number }, @Ctx() ctx: TrpcContext) {
    return this.usageImages.list(ctx.user!, input.usageKey);
  }

  /** Remove one of your own, while the stage it belongs to is still open. */
  @UseMiddlewares(AuthMiddleware)
  @Mutation({ input: detachUsagePhotoInput, output: usagePhotosOutput })
  detachUsagePhoto(
    @Input() input: DetachUsagePhotoInput,
    @Ctx() ctx: TrpcContext,
  ) {
    return this.usageImages.detach(ctx.user!, input.imageKey);
  }
}
