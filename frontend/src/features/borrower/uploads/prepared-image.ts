/**
 * A borrower-selected image before it is attached to a backend record.
 *
 * Keeping the File is load-bearing: a blob URL is only a preview and cannot
 * later be handed to the signed-upload flow. `ready` means client validation
 * passed and the File is waiting for that flow; the remaining states are here
 * now so adding the upload mutation does not require reshaping every page's
 * state again.
 */
export type PreparedImageStatus = "ready" | "uploading" | "uploaded" | "error";

export interface PreparedBorrowerImage {
  file: File;
  previewUrl: string;
  contentType: "image/jpeg" | "image/png";
  sizeBytes: number;
  status: PreparedImageStatus;
  /** Storage URL returned after the future signed PUT succeeds. */
  imageUrl?: string;
  error?: string;
}

/** Build upload-ready state after `validateUploadFile` has accepted the File. */
export function prepareBorrowerImage(file: File): PreparedBorrowerImage {
  return {
    file,
    previewUrl: URL.createObjectURL(file),
    contentType: file.type as PreparedBorrowerImage["contentType"],
    sizeBytes: file.size,
    status: "ready",
  };
}

/** Release only previews created locally; remote HTTP URLs are not ours. */
export function releaseBorrowerImage(image: PreparedBorrowerImage | null | undefined): void {
  if (image?.previewUrl.startsWith("blob:")) URL.revokeObjectURL(image.previewUrl);
}

export function releaseBorrowerImages(images: Iterable<PreparedBorrowerImage>): void {
  for (const image of images) releaseBorrowerImage(image);
}
