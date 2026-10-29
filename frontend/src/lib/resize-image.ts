/**
 * Shrink a phone photo before it is uploaded (#238, P-01).
 *
 * Photos are stored as bytes in the database, and a phone camera file is
 * 3-5 MB, so the free 1 GB database on Render holds only a few hundred of them.
 * A JPEG heavier than RESIZE_SKIP_BYTES is drawn onto a canvas no longer than
 * RESIZE_MAX_EDGE on its long edge and re-encoded at RESIZE_QUALITY - still
 * sharp enough to see a scratch, usually 200-400 KB.
 *
 * Anything else comes back unchanged: a PNG (JPEG would drop its
 * transparency), a file the browser cannot decode (HEIC on some phones), a
 * browser without canvas support, or a result that would not be smaller. The
 * server checks type, size and bytes either way, so this only saves space.
 * Re-encoding also drops EXIF (GPS, phone model) before the file leaves the
 * device; the server strips it again.
 */
export const RESIZE_MAX_EDGE = 1600;
export const RESIZE_QUALITY = 0.8;
export const RESIZE_SKIP_BYTES = 400 * 1024;

export async function resizeForUpload(file: File): Promise<File> {
  if (file.type !== "image/jpeg" || file.size <= RESIZE_SKIP_BYTES) return file;
  if (typeof createImageBitmap !== "function") return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }
  try {
    const scale = Math.min(1, RESIZE_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", RESIZE_QUALITY)
    );
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name, { type: "image/jpeg", lastModified: file.lastModified });
  } catch {
    return file;
  } finally {
    bitmap.close?.();
  }
}
