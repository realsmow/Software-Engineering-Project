import { Ctx, Input, Mutation, Router, UseMiddlewares } from 'nestjs-trpc';
import { StaffMiddleware } from '../trpc/auth.middleware';
import type { TrpcContext } from '../trpc/context';
import {
  requestUploadInput,
  requestUploadOutput,
  type RequestUploadInput,
} from './image.schema';
import { ImageService } from './image.service';

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
@UseMiddlewares(StaffMiddleware)
export class ImageRouter {
  constructor(private readonly imageService: ImageService) {}

  /**
   * Issues a short-lived, signed URL to PUT one file at.
   *
   * Returns `imageUrl` as the relative `/media/...` path — that is the value to
   * hand to `item.createType`, `item.createUnit`, `item.createRoom` or
   * `inspection.create`. `previewUrl` is the same file, absolute, for showing
   * it before the record is saved.
   */
  @Mutation({ input: requestUploadInput, output: requestUploadOutput })
  requestUpload(@Input() input: RequestUploadInput, @Ctx() ctx: TrpcContext) {
    return this.imageService.issueTicket(input, ctx.user!.accountKey);
  }
}
