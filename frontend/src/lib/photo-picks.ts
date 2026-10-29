import { UPLOAD } from "@/constants";
import { validateUploadFile } from "@/lib/upload-validation";

/**
 * A JPEG is shrunk before upload (resize-image.ts), so a phone photo above the
 * server's 5 MB limit can still be picked. The server checks what is sent.
 */
export const MAX_JPEG_BEFORE_RESIZE = 25 * 1024 * 1024;

export interface PhotoPick {
  /** The files to upload, in the order picked. */
  accepted: File[];
  /** The first problem found, for the message; null when everything was taken. */
  problem: "INVALID_FILE_TYPE" | "FILE_TOO_LARGE" | "TOO_MANY" | null;
}

/**
 * #238 (instructor item 3): what one pick of several files may add, given how
 * many photos the stage already has. Invalid files are skipped, and anything
 * past the cap is left out rather than refused by the server one by one.
 */
export function takePhotos(
  files: Iterable<File>,
  already: number,
  max: number = UPLOAD.MAX_PHOTOS_PER_STAGE,
): PhotoPick {
  const valid: File[] = [];
  let problem: PhotoPick["problem"] = null;
  for (const file of files) {
    const result = validateUploadFile(
      file,
      file.type === "image/jpeg" ? { maxBytes: MAX_JPEG_BEFORE_RESIZE } : {},
    );
    if (result.ok) valid.push(file);
    else problem ??= result.code;
  }
  const room = Math.max(0, max - already);
  if (valid.length > room) problem ??= "TOO_MANY";
  return { accepted: valid.slice(0, room), problem };
}
