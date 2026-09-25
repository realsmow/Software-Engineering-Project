import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpException,
  Param,
  Put,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { TRPCError } from '@trpc/server';
import { rateLimiter } from '../common/security/rate-limiter';
import { BusinessError } from '../common/errors/business-error';
import { ImageService } from './image.service';

/** NFR-SEC-05: generous enough that a real upload session never trips it. */
const UPLOAD_RATE_LIMIT = 60;
const UPLOAD_RATE_WINDOW_MS = 60 * 1000;

/** tRPC's own codes mapped onto HTTP, so this route answers like the rest of the API. */
const HTTP_STATUS: Partial<Record<TRPCError['code'], number>> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  PRECONDITION_FAILED: 412,
};

/**
 * Step 2 of the upload flow (CONTRACT.md §3): the raw `PUT`.
 *
 * The one route in this codebase that is not a tRPC procedure, because it
 * cannot be — tRPC carries JSON and this carries image bytes. It matches what
 * `api-client.uploadFile` already does: `PUT` the `File` as the whole body with
 * its own Content-Type, no cookies, no form encoding.
 *
 * **There is no session here.** A cross-origin `fetch` without
 * `credentials: 'include'` sends none, and the frontend's helper does not set
 * it. Authorisation is the signed ticket in the URL and nothing else, which is
 * why ImageService checks its signature, its expiry, its content type, its size
 * and the file's own leading bytes before writing anything.
 *
 * Errors come back as `{ code, ... }` with the same business codes the tRPC
 * procedures use, so the frontend's error table works here too — though
 * `uploadFile` currently only reads the status.
 */
@Controller('uploads')
export class ImageController {
  constructor(private readonly imageService: ImageService) {}

  @Put(':token')
  @HttpCode(201)
  async upload(
    @Param('token') token: string,
    @Headers('content-type') contentType: string | undefined,
    @Body() body: unknown,
    @Req() req: Request,
  ) {
    // NFR-SEC-05: this route has no session to key a limiter off, same as the
    // signature check below - the IP is all that's left.
    const ip = req.ip ?? 'unknown';
    if (
      !rateLimiter.consume(
        `upload:${ip}`,
        UPLOAD_RATE_LIMIT,
        UPLOAD_RATE_WINDOW_MS,
      )
    ) {
      throw new HttpException({ code: 'TOO_MANY_REQUESTS' }, 429);
    }

    const ticket = this.imageService.verifyTicket(token);
    if (!ticket) {
      // One answer for expired, forged and malformed alike — telling the two
      // apart tells a forger how close they got.
      throw this.toHttp(new BusinessError('UPLOAD_TICKET_INVALID'));
    }

    // express.raw only fills a Buffer for the media types main.ts lists. Any
    // other Content-Type leaves an empty object here, and that is the signal
    // rather than an error from the parser.
    if (!Buffer.isBuffer(body)) {
      throw this.toHttp(
        new BusinessError('UPLOAD_TYPE_MISMATCH', {
          expected: ticket.contentType,
          actual: contentType ?? null,
        }),
      );
    }

    try {
      const imageUrl = await this.imageService.store(
        ticket,
        body,
        (contentType ?? '').split(';')[0].trim(),
      );

      return {
        imageUrl,
        previewUrl: this.imageService.toPublicUrl(imageUrl),
        bytes: body.length,
      };
    } catch (error) {
      if (error instanceof BusinessError) throw this.toHttp(error);
      throw error;
    }
  }

  /** BusinessError -> HttpException, keeping the business code in the body. */
  private toHttp(error: BusinessError): HttpException {
    return new HttpException(
      { code: error.businessCode, cause: error.details },
      HTTP_STATUS[error.code] ?? 400,
    );
  }
}
