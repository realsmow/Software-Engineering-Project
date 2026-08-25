import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, normalize, resolve, sep } from 'node:path';
import { signToken, verifyToken } from '../common/crypto/token';
import { BusinessError } from '../common/errors/business-error';
import { toIso } from '../common/schemas/datetime.schema';
import {
  MAX_UPLOAD_BYTES,
  MEDIA_PREFIX,
  UPLOAD_EXTENSION,
  matchesMagicBytes,
  type UploadContentType,
} from '../common/schemas/image.schema';
import type { RequestUploadInput, UploadPurpose } from './image.schema';

/** How long an upload ticket stays good. Long enough to pick a file, not to hoard. */
const TICKET_TTL_MS = 10 * 60 * 1000;

/** Route the browser PUTs to. Must match ImageController. */
const UPLOAD_PATH = '/uploads';

/** What a verified upload ticket carries. Signed, therefore tamper-evident. */
interface UploadTicket {
  /** Storage-relative key, e.g. `itemType/2026/08/<uuid>.png` */
  key: string;
  contentType: UploadContentType;
  sizeBytes: number;
  accountKey: number;
  expiresAt: number;
}

/**
 * Issuing upload tickets, receiving the bytes, and turning storage keys into
 * URLs.
 *
 * **Storage is the local filesystem.** That is a deliberate choice for a
 * project with no object-storage budget line, not an oversight: the shape of
 * the flow is the pre-signed-URL shape from CONTRACT.md §3, so moving to S3
 * later replaces `issueTicket`'s URL construction and `store`'s `writeFile`
 * and touches nothing else — no domain code, no frontend code.
 *
 * **The ticket is the authorisation.** `api-client.uploadFile` sends a bare
 * `fetch` PUT with no cookies, so the PUT endpoint cannot read a session. What
 * makes it safe is that the URL itself is an HMAC-signed capability, scoped to
 * one storage key, one content type and one size, expiring in ten minutes.
 * Without that signature the route is an open file drop.
 */
@Injectable()
export class ImageService {
  private readonly logger = new Logger(ImageService.name);
  private readonly secret: string;
  private readonly mediaRoot: string;
  private readonly publicApiUrl: string;

  constructor(private readonly config: ConfigService) {
    this.secret = this.resolveSecret();
    this.mediaRoot = resolve(
      this.config.get<string>('MEDIA_ROOT') ?? './media',
    );
    this.publicApiUrl = (
      this.config.get<string>('PUBLIC_API_URL') ?? 'http://localhost:3000'
    ).replace(/\/+$/, '');
  }

  /** Where main.ts mounts the static files from. */
  get storageRoot(): string {
    return this.mediaRoot;
  }

  // =========================================================================
  // Step 1 — hand out a ticket
  // =========================================================================

  issueTicket(input: RequestUploadInput, accountKey: number) {
    const key = this.buildKey(input.purpose, input.contentType);
    const expiresAt = Date.now() + TICKET_TTL_MS;

    const ticket: UploadTicket = {
      key,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      accountKey,
      expiresAt,
    };
    const token = signToken(JSON.stringify(ticket), this.secret);

    return {
      uploadUrl: `${this.publicApiUrl}${UPLOAD_PATH}/${token}`,
      imageUrl: `${MEDIA_PREFIX}${key}`,
      previewUrl: this.toPublicUrl(`${MEDIA_PREFIX}${key}`)!,
      expiresAt: toIso(new Date(expiresAt)),
      maxBytes: Math.min(input.sizeBytes, MAX_UPLOAD_BYTES),
    };
  }

  // =========================================================================
  // Step 2 — take the bytes
  // =========================================================================

  /** Returns the ticket, or null for anything forged, malformed or expired. */
  verifyTicket(token: string): UploadTicket | null {
    const payload = verifyToken(token, this.secret);
    if (payload === null) return null;

    let ticket: UploadTicket;
    try {
      ticket = JSON.parse(payload) as UploadTicket;
    } catch {
      return null;
    }

    if (typeof ticket.key !== 'string' || ticket.key.length === 0) return null;
    if (!Number.isFinite(ticket.expiresAt) || ticket.expiresAt <= Date.now())
      return null;

    return ticket;
  }

  /**
   * Writes an accepted file and returns the URL to store.
   *
   * Every check here duplicates one the client already made. That is the
   * point: the frontend's own upload-validation module says so in its header,
   * and a signed ticket proves who asked for the slot, not what they then sent
   * to it.
   */
  async store(
    ticket: UploadTicket,
    body: Buffer,
    declaredType: string,
  ): Promise<string> {
    if (declaredType !== ticket.contentType) {
      throw new BusinessError('UPLOAD_TYPE_MISMATCH', {
        expected: ticket.contentType,
        actual: declaredType,
      });
    }
    if (body.length === 0) {
      throw new BusinessError('UPLOAD_EMPTY', { key: ticket.key });
    }
    if (body.length > Math.min(ticket.sizeBytes, MAX_UPLOAD_BYTES)) {
      // The ticket was issued for a stated size. A larger body means the client
      // asked for a small slot and sent a big file.
      throw new BusinessError('UPLOAD_TOO_LARGE', {
        maxBytes: Math.min(ticket.sizeBytes, MAX_UPLOAD_BYTES),
        actualBytes: body.length,
      });
    }
    if (!matchesMagicBytes(body, ticket.contentType)) {
      throw new BusinessError('UPLOAD_NOT_AN_IMAGE', {
        contentType: ticket.contentType,
      });
    }

    const destination = this.resolveWithinRoot(ticket.key);
    await mkdir(dirname(destination), { recursive: true });

    try {
      // wx: never overwrite. Keys carry a UUID, so a collision is a replayed
      // ticket rather than bad luck, and letting a replay rewrite a file some
      // row already points at would swap the photo under an existing record.
      await writeFile(destination, body, { flag: 'wx' });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        // Expected, so it gets a business code rather than escaping as a 500
        // with a filesystem path in the stack trace.
        throw new BusinessError('UPLOAD_ALREADY_STORED', { key: ticket.key });
      }
      throw error;
    }

    return `${MEDIA_PREFIX}${ticket.key}`;
  }

  // =========================================================================
  // URLs in and out
  // =========================================================================

  /**
   * What goes in the database column.
   *
   * An absolute URL of ours is folded back to the relative form, so the stored
   * value survives the API moving to a different host. Anything else — a real
   * external URL — is kept as given.
   */
  toStoredUrl(value: string): string;
  toStoredUrl(value: string | undefined): string | undefined;
  toStoredUrl(value: string | undefined): string | undefined {
    if (value === undefined) return undefined;

    const prefix = `${this.publicApiUrl}${MEDIA_PREFIX}`;
    return value.startsWith(prefix)
      ? `${MEDIA_PREFIX}${value.slice(prefix.length)}`
      : value;
  }

  /** What goes out to clients: relative paths become absolute, URLs pass through. */
  toPublicUrl(value: string | null | undefined): string | null {
    if (value === null || value === undefined || value === '') return null;

    return value.startsWith(MEDIA_PREFIX)
      ? `${this.publicApiUrl}${value}`
      : value;
  }

  // =========================================================================
  // Internals
  // =========================================================================

  /**
   * `purpose/YYYY/MM/<uuid>.<ext>`.
   *
   * Dated folders keep one directory from growing to hundreds of thousands of
   * entries. The UUID is the whole filename — nothing the client sent is used
   * to build a path, which is what makes traversal impossible rather than
   * merely filtered.
   */
  private buildKey(
    purpose: UploadPurpose,
    contentType: UploadContentType,
  ): string {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');

    return `${purpose}/${year}/${month}/${randomUUID()}.${UPLOAD_EXTENSION[contentType]}`;
  }

  /**
   * Belt and braces on top of the UUID naming: resolve the key and refuse
   * anything that lands outside the media root.
   *
   * The key comes out of a signature we produced, so it cannot have been
   * edited — but a bug that ever let a caller influence it would otherwise turn
   * straight into an arbitrary file write.
   */
  private resolveWithinRoot(key: string): string {
    const destination = resolve(join(this.mediaRoot, normalize(key)));

    if (
      destination !== this.mediaRoot &&
      !destination.startsWith(this.mediaRoot + sep)
    ) {
      throw new BusinessError('UPLOAD_REJECTED', { key });
    }
    return destination;
  }

  /**
   * Upload tickets are signed with SESSION_SECRET.
   *
   * One secret rather than two: a second one is a second thing to forget to
   * set, and both are short-lived capabilities issued by this same server.
   * Rotating it invalidates in-flight upload tickets along with sessions,
   * which is the correct blast radius.
   */
  private resolveSecret(): string {
    const configured = this.config.get<string>('SESSION_SECRET');
    if (configured && configured.length >= 32) return configured;

    if (this.config.get('NODE_ENV') === 'production') {
      throw new Error(
        'SESSION_SECRET must be set to at least 32 characters in production.',
      );
    }

    this.logger.warn(
      'SESSION_SECRET is not set — upload URLs are signed with a random per-process secret and stop working on restart.',
    );
    return randomBytes(48).toString('base64url');
  }
}
