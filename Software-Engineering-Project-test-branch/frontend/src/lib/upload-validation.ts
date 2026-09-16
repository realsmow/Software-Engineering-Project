import { UPLOAD } from "@/constants";

/**
 * Client-side file-upload guard (tester AC §4 - File Upload & API Security).
 *
 * The borrower/staff photo flows upload via a pre-signed PUT (`api-client.
 * uploadFile`), which does no validation of its own. This runs *before* that
 * PUT to reject oversized or wrong-type files early and surface the right
 * business error code. It is defense-in-depth only - the backend remains the
 * authoritative validator and must re-check type/size on receipt.
 */

/** Minimal shape so this is unit-testable without a real DOM `File`. */
export interface UploadCandidate {
  name: string;
  type: string;
  size: number;
}

export type UploadValidationResult =
  | { ok: true }
  | { ok: false; code: "FILE_TOO_LARGE" | "INVALID_FILE_TYPE" };

export interface UploadRules {
  maxBytes?: number;
  allowedMime?: readonly string[];
  allowedExt?: readonly string[];
}

function hasAllowedExtension(name: string, allowedExt: readonly string[]): boolean {
  const lower = name.toLowerCase();
  return allowedExt.some((ext) => lower.endsWith(ext));
}

/**
 * Validate a file against size + type rules. Type is checked by BOTH MIME and
 * extension so a renamed executable (e.g. `virus.exe` relabeled `image/png`, or
 * `virus.png` carrying a non-image MIME) is rejected - the two must agree.
 */
export function validateUploadFile(
  file: UploadCandidate,
  rules: UploadRules = {},
): UploadValidationResult {
  const maxBytes = rules.maxBytes ?? UPLOAD.MAX_BYTES;
  const allowedMime = rules.allowedMime ?? UPLOAD.ALLOWED_MIME;
  const allowedExt = rules.allowedExt ?? UPLOAD.ALLOWED_EXT;

  const mimeOk = allowedMime.includes(file.type);
  const extOk = hasAllowedExtension(file.name, allowedExt);
  if (!mimeOk || !extOk) return { ok: false, code: "INVALID_FILE_TYPE" };

  // Reject empty and oversized files.
  if (file.size <= 0 || file.size > maxBytes) return { ok: false, code: "FILE_TOO_LARGE" };

  return { ok: true };
}

/** `accept` attribute value for an <input type="file">, from the allowed MIME list. */
export function uploadAcceptAttr(allowedMime: readonly string[] = UPLOAD.ALLOWED_MIME): string {
  return allowedMime.join(",");
}
