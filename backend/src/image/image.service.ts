import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { PrismaService } from '../prisma.service';
import { signToken, verifyToken } from '../common/crypto/token';
import { signMediaKey, verifyMediaKey } from '../common/security/media-url';
import { BusinessError } from '../common/errors/business-error';
import { toIso } from '../common/schemas/datetime.schema';
import {
  MAX_UPLOAD_BYTES,
  MEDIA_PREFIX,
  UPLOAD_EXTENSION,
  matchesMagicBytes,
  type UploadContentType,
} from '../common/schemas/image.schema';
import {
  EVIDENCE_UPLOAD_PURPOSE,
  type RequestUploadInput,
  type UploadPurpose,
} from './image.schema';
import { stripImageMetadata } from './strip-metadata';

/** How long an upload ticket stays good. Long enough to pick a file, not to hoard. */
const TICKET_TTL_MS = 10 * 60 * 1000;

/**
 * How long a signed evidence URL stays good (NFR-SEC-06).
 *
 * Long enough to load a page of photos and let a slow connection finish, not
 * so long that a URL pasted somewhere keeps working for days. Every read
 * mints a fresh one, so the grading screen or appeal desk re-requesting the
 * list is the normal way a stale link gets replaced - nothing needs to renew
 * one in place.
 */
const EVIDENCE_URL_TTL_MS = 15 * 60 * 1000;

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
 * **Storage is the MediaFile table.** The host's disk is wiped on every
 * restart, so files written there vanished (#6). The flow keeps the
 * pre-signed-URL shape from CONTRACT.md §3, so moving to S3 later replaces
 * `store` and `read` and touches nothing else.
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

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
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

    // The key is signed, so this only guards against a future bug that lets
    // a caller shape it: nothing but `purpose/YYYY/MM/<uuid>.ext` is stored.
    if (
      !/^[A-Za-z]+\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.(jpg|png)$/.test(ticket.key)
    ) {
      throw new BusinessError('UPLOAD_REJECTED', { key: ticket.key });
    }
    // Stored in the database: the host's disk is wiped on restart (#6).
    try {
      await this.prisma.mediaFile.create({
        data: {
          Key: ticket.key,
          ContentType: ticket.contentType,
          // #177: GPS and device details must not reach whoever opens the photo.
          Bytes: new Uint8Array(stripImageMetadata(body, ticket.contentType)),
        },
      });
    } catch (error) {
      // Keys carry a UUID, so a duplicate is a replayed ticket. Letting it
      // rewrite a photo some row already points at would swap the evidence.
      if ((error as { code?: unknown } | null)?.code === 'P2002') {
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
   * external URL — is kept as given, query string included: that query is part
   * of somebody else's address.
   *
   * Our own media paths lose theirs (#206). `?exp=&sig=` is minted for one
   * read and dies fifteen minutes later; stored as the reference, it turns a
   * permanent record into one that stops working. A photo copied between two
   * loans was exactly that - the hook handed back the signed URL it had been
   * rendering, `attach` wrote it down, and the copy 403'd once the signature
   * aged out while the bytes sat in MediaFile the whole time.
   */
  toStoredUrl(value: string): string;
  toStoredUrl(value: string | undefined): string | undefined;
  toStoredUrl(value: string | undefined): string | undefined {
    if (value === undefined) return undefined;

    const prefix = `${this.publicApiUrl}${MEDIA_PREFIX}`;
    const relative = value.startsWith(prefix)
      ? `${MEDIA_PREFIX}${value.slice(prefix.length)}`
      : value;
    if (!relative.startsWith(MEDIA_PREFIX)) return value;

    const query = relative.indexOf('?');
    return query === -1 ? relative : relative.slice(0, query);
  }

  /**
   * What goes out to clients: relative paths become absolute, URLs pass
   * through.
   *
   * NFR-SEC-06: a path under the evidence folder (see
   * `EVIDENCE_UPLOAD_PURPOSE`) is never handed out plain - it comes back
   * signed and expiring, minted fresh on every call. A catalogue path (or an
   * external URL, already left alone above) is a public product photo and is
   * not signed at all, since it is meant to be cacheable and permanent.
   *
   * The stored value is normalised first rather than trusted. A row written
   * before #206 holds an absolute, already-signed URL of ours, and passing
   * that straight through handed the client the dead signature again every
   * time it asked. Folding it back to the key and re-signing repairs those
   * rows on read, with no migration.
   */
  toPublicUrl(value: string | null | undefined): string | null {
    if (value === null || value === undefined || value === '') return null;

    const stored = this.toStoredUrl(value);
    if (!stored.startsWith(MEDIA_PREFIX)) return stored;

    const key = stored.slice(MEDIA_PREFIX.length);
    return this.isEvidenceKey(key)
      ? this.signEvidenceUrl(key)
      : `${this.publicApiUrl}${stored}`;
  }

  /**
   * Verifies a signed evidence request (NFR-SEC-06): `key` is the
   * MEDIA_PREFIX-relative storage key the caller asked for, `exp`/`sig` come
   * from its query string. One false for "expired", "forged" and "wrong key"
   * alike - see `verifyMediaKey`.
   */
  verifyEvidenceAccess(key: string, exp: number, sig: string): boolean {
    return verifyMediaKey(key, exp, sig, this.secret);
  }

  /**
   * The bytes for a storage key, or null when there are none.
   *
   * Files written to disk before photos moved into the database are still
   * read from there, so older local setups keep their pictures.
   */
  async read(
    key: string,
  ): Promise<{ contentType: string; bytes: Buffer } | null> {
    const row = await this.prisma.mediaFile.findUnique({
      where: { Key: key },
      select: { ContentType: true, Bytes: true },
    });
    if (row)
      return { contentType: row.ContentType, bytes: Buffer.from(row.Bytes) };

    const file = this.resolveEvidenceFile(key);
    if (!file) return null;
    try {
      const ext = extname(file).slice(1);
      const type = Object.entries(UPLOAD_EXTENSION).find(([, e]) => e === ext);
      if (!type) return null;
      return { contentType: type[0], bytes: await readFile(file) };
    } catch {
      return null;
    }
  }

  /**
   * Absolute path on disk for an evidence key, or null if it would resolve
   * outside the media root. Reuses the same traversal guard `store()` writes
   * behind - the key here comes from a request path rather than our own
   * signature payload, so the belt-and-braces check earns its keep here more
   * than anywhere else in this file.
   */
  resolveEvidenceFile(key: string): string | null {
    try {
      return this.resolveWithinRoot(key);
    } catch {
      return null;
    }
  }

  /** Whether `key` (MEDIA_PREFIX-relative, no leading slash) is an evidence file. */
  private isEvidenceKey(key: string): boolean {
    return key.split('/')[0] === EVIDENCE_UPLOAD_PURPOSE;
  }

  private signEvidenceUrl(key: string): string {
    const exp = Date.now() + EVIDENCE_URL_TTL_MS;
    const sig = signMediaKey(key, exp, this.secret);
    return `${this.publicApiUrl}${MEDIA_PREFIX}${key}?exp=${exp}&sig=${sig}`;
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
