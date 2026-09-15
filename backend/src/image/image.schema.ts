import { z } from 'zod';
import { isoDateTime } from '../common/schemas/datetime.schema';
import { dbId } from '../common/schemas/id.schema';
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

// ---------------------------------------------------------------------------
// Check-in / check-out photos (§5.9)
//
// The other half of the image story, and the one that does not go through a
// ticket. The frontend uploads the file itself and sends back the URL; the
// backend's job here is only to record which loan, which stage and who.
//
// That split is the team's decision (2026-09-16): `image.requestUpload` above
// stays for the staff screens already built on it, and everything added from
// here stores a URL the client has already put somewhere. The value is still
// validated by `imageUrl` — "the frontend uploads it" changes who writes the
// bytes, not whether an arbitrary string may land in an `<img src>`.
// ---------------------------------------------------------------------------

/**
 * Which side of the loan a photo belongs to.
 *
 * `SubmissionType` in the database has a third value, `InspectionPicture`,
 * which staff write through `inspection.create` and which no borrower may
 * claim. Keeping it out of this enum is what stops a borrower filing their own
 * photo as the inspector's evidence.
 */
export const usagePhotoStage = z.enum(['before', 'after']);
export type UsagePhotoStage = z.infer<typeof usagePhotoStage>;

/** Enough for a unit photographed from every side, few enough to stay a record. */
export const MAX_PHOTOS_PER_STAGE = 10;

/**
 * Attach photos to a loan (CONTRACT.md §3, step 3).
 *
 * A list rather than one URL per call: the borrower photographs the thing from
 * several angles in one go, and one mutation per photo would let a half-filed
 * set survive a dropped connection.
 */
export const attachUsagePhotosInput = z.object({
  usageKey: dbId,
  stage: usagePhotoStage,
  imageUrls: z.array(imageUrl).min(1).max(MAX_PHOTOS_PER_STAGE),
});
export type AttachUsagePhotosInput = z.infer<typeof attachUsagePhotosInput>;

export const usagePhotoOutput = z.object({
  imageKey: z.number().int(),
  /** Relative `/media/...` or an absolute URL — see common/schemas/image.schema.ts. */
  imageUrl: z.string(),
  /** `inspection` appears on reads only; nothing here can write it. */
  stage: z.enum(['before', 'after', 'inspection']),
  submittedBy: z.number().int(),
  submittedAt: isoDateTime.nullable(),
});

export const usagePhotosInput = z.object({ usageKey: dbId });

/** Both sides of one loan, which is how the return screen shows them. */
export const usagePhotosOutput = z.object({
  before: z.array(usagePhotoOutput),
  after: z.array(usagePhotoOutput),
  inspection: z.array(usagePhotoOutput),
});

/** Remove one photo the caller filed by mistake. */
export const detachUsagePhotoInput = z.object({ imageKey: dbId });
export type DetachUsagePhotoInput = z.infer<typeof detachUsagePhotoInput>;
