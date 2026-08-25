import { z } from 'zod';
import { isoDateTime } from '../common/schemas/datetime.schema';
import {
  MAX_UPLOAD_BYTES,
  imageUrl,
  uploadContentType,
} from '../common/schemas/image.schema';

/**
 * File upload (CONTRACT.md §3).
 *
 * tRPC speaks JSON, so bytes cannot travel through it. The agreed flow is three
 * steps, and this domain owns the first:
 *
 *   1. `image.requestUpload` — the server issues a short-lived, signed URL
 *   2. `api-client.uploadFile` — the browser PUTs the file straight at it
 *   3. the domain mutation (`item.createType`, `inspection.create`, …) is
 *      handed the resulting `imageUrl` and stores it
 *
 * Step 3 is the commit: a file uploaded in step 2 and never named in step 3 is
 * simply an orphan on disk, which is the correct failure mode — it is
 * unreferenced rather than half-attached to a record.
 */

/**
 * What the file is for.
 *
 * It decides both who may ask for the URL and where the file is filed. Every
 * value here is staff-only today; the borrower's own before/after photos are
 * part of the borrower slice and add their own values, with their own check
 * that the caller actually holds the loan in question.
 */
export const uploadPurpose = z.enum([
  /** ItemInfo.ImageURL — the catalogue photo of a type */
  'itemType',
  /** ItemIndiv.ImageURL — a photo of one physical unit */
  'itemUnit',
  /** RoomInfo.ImageURL — a photo of a room (T3) */
  'room',
  /** Images.InspectionPicture — what the inspector saw at grading */
  'inspection',
]);
export type UploadPurpose = z.infer<typeof uploadPurpose>;

/**
 * Ask for somewhere to put a file.
 *
 * Type and size are declared up front so an oversized or wrong-type file is
 * refused before a single byte is sent — and, because both are baked into the
 * signed token, the ticket is good for *this* file rather than for any file.
 */
export const requestUploadInput = z.object({
  purpose: uploadPurpose,
  contentType: uploadContentType,
  /** Real byte length of the file. Re-checked against what actually arrives. */
  sizeBytes: z.number().int().positive().max(MAX_UPLOAD_BYTES),
});
export type RequestUploadInput = z.infer<typeof requestUploadInput>;

export const requestUploadOutput = z.object({
  /** Absolute. PUT the raw bytes here with the same Content-Type. */
  uploadUrl: z.url(),
  /**
   * Pass this straight back to the domain mutation that stores it
   * (`item.createType({ imageUrl })` and friends).
   */
  imageUrl,
  /** Absolute version of the same file, ready for an `<img src>` preview. */
  previewUrl: z.url(),
  /** After this the upload URL stops working and a new one must be requested. */
  expiresAt: isoDateTime,
  /** Echoed back so the client can re-check before sending. */
  maxBytes: z.number().int().positive(),
});
