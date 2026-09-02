import { z } from 'zod';

/**
 * Where uploaded files are served from, and what a stored image URL may look
 * like.
 *
 * Two forms are accepted on the way in and one is kept:
 *
 *   - `/media/...` — a path this server issued. This is what gets stored.
 *   - `http(s)://...` — an absolute URL, either one of ours (normalised back to
 *     the relative form) or somebody else's (kept as-is, e.g. a manufacturer's
 *     product photo).
 *
 * Everything else is refused. `ImageURL` ends up in an `<img src>` on the
 * frontend, and `javascript:` or `data:` in that position is stored XSS — a
 * URL column that accepts any string is the whole vulnerability.
 */

/** Public path prefix for stored files. Must match the static mount in main.ts. */
export const MEDIA_PREFIX = '/media/';

/** Max length of the column value. Long enough for a UUID key or a real URL. */
const MAX_URL_LENGTH = 500;

function isSafeImageUrl(value: string): boolean {
  if (value.startsWith(MEDIA_PREFIX)) {
    // No traversal: the path is ours, so it may not climb out of the mount.
    return !value.includes('..');
  }

  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * An image URL as accepted by any mutation that stores one.
 *
 * Deliberately not `z.url()`: that would reject the relative `/media/...` form
 * this server hands back from `image.requestUpload`, which is the common case.
 */
export const imageUrl = z
  .string()
  .trim()
  .min(1)
  .max(MAX_URL_LENGTH)
  .refine(isSafeImageUrl, {
    message: `must be an http(s) URL or a path under ${MEDIA_PREFIX}`,
  });

/** The MIME types the system accepts — matches the frontend's UPLOAD.ALLOWED_MIME. */
export const uploadContentType = z.enum(['image/jpeg', 'image/png']);
export type UploadContentType = z.infer<typeof uploadContentType>;

/** Matches the frontend's UPLOAD.MAX_BYTES (5 MB). Re-checked on receipt. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** File extension per accepted type. The client never chooses the filename. */
export const UPLOAD_EXTENSION: Record<UploadContentType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

/**
 * First bytes each accepted format must begin with.
 *
 * A declared Content-Type is a claim by the uploader, not a fact. Checking the
 * signature is what makes the type check mean something — otherwise a file
 * labelled `image/png` can hold anything at all, and the label is the only
 * thing standing between the media directory and arbitrary content.
 */
export const MAGIC_BYTES: Record<UploadContentType, number[]> = {
  'image/jpeg': [0xff, 0xd8, 0xff],
  'image/png': [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
};

export function matchesMagicBytes(
  buffer: Buffer,
  contentType: UploadContentType,
): boolean {
  const expected = MAGIC_BYTES[contentType];
  if (buffer.length < expected.length) return false;

  return expected.every((byte, index) => buffer[index] === byte);
}
