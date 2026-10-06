import type { UploadContentType } from '../common/schemas/image.schema';

/**
 * Drops EXIF, XMP, IPTC and text metadata from an uploaded image (#177).
 *
 * Phone photos carry GPS coordinates and the device model, and every photo
 * here is shown to staff and supervisors. No image library is installed, and
 * both formats keep metadata in separate segments, so removing those segments
 * is enough; the pixel data is copied untouched.
 *
 * Anything the parser does not understand is copied as-is rather than
 * refused, because the magic-byte check has already decided this is an image.
 */
export function stripImageMetadata(
  body: Buffer,
  contentType: UploadContentType,
): Buffer {
  return contentType === 'image/png'
    ? stripPngMetadata(body)
    : stripJpegMetadata(body);
}

// APP0 (JFIF), APP2 (ICC colour profile) and APP14 (Adobe colour transform)
// affect how the image renders. Every other APPn segment and COM is metadata.
const KEEP_JPEG_APP = new Set([0xe0, 0xe2, 0xee]);

export function stripJpegMetadata(buf: Buffer): Buffer {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return buf;

  const out: Buffer[] = [buf.subarray(0, 2)];
  let orientation: number | null = null;
  let pos = 2;

  while (pos + 4 <= buf.length && buf[pos] === 0xff) {
    const marker = buf[pos + 1];
    if (marker === 0xff) {
      // Fill byte before a marker.
      pos += 1;
      continue;
    }
    // Start of scan or end of image: the rest is pixel data.
    if (marker === 0xda || marker === 0xd9) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      out.push(buf.subarray(pos, pos + 2));
      pos += 2;
      continue;
    }

    const end = pos + 2 + buf.readUInt16BE(pos + 2);
    if (end > buf.length) break;

    const isMetadata =
      marker === 0xfe ||
      (marker >= 0xe1 && marker <= 0xef && !KEEP_JPEG_APP.has(marker));
    if (!isMetadata) {
      out.push(buf.subarray(pos, end));
    } else if (marker === 0xe1 && orientation === null) {
      orientation = readExifOrientation(buf.subarray(pos + 4, end));
    }
    pos = end;
  }
  out.push(buf.subarray(pos));

  // Orientation is the one EXIF tag that changes how the photo looks, so it
  // is written back on its own. Otherwise portrait phone shots turn sideways.
  if (orientation !== null && orientation !== 1) {
    const afterJfif = out[1]?.[1] === 0xe0 ? 2 : 1;
    out.splice(afterJfif, 0, orientationSegment(orientation));
  }
  return Buffer.concat(out);
}

/** Orientation (tag 0x0112) from an APP1 payload, or null. */
function readExifOrientation(payload: Buffer): number | null {
  if (payload.length < 14 || payload.toString('latin1', 0, 6) !== 'Exif\0\0') {
    return null;
  }
  const tiff = payload.subarray(6);
  const little = tiff.toString('latin1', 0, 2) === 'II';
  const u16 = (at: number) =>
    little ? tiff.readUInt16LE(at) : tiff.readUInt16BE(at);
  const u32 = (at: number) =>
    little ? tiff.readUInt32LE(at) : tiff.readUInt32BE(at);

  const ifd = u32(4);
  if (ifd + 2 > tiff.length) return null;
  const count = u16(ifd);
  for (let i = 0; i < count; i++) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > tiff.length) return null;
    if (u16(entry) === 0x0112) {
      const value = u16(entry + 8);
      return value >= 1 && value <= 8 ? value : null;
    }
  }
  return null;
}

/** A minimal big-endian EXIF APP1 holding only the orientation. */
function orientationSegment(orientation: number): Buffer {
  const seg = Buffer.alloc(36);
  seg.writeUInt16BE(0xffe1, 0);
  seg.writeUInt16BE(34, 2);
  seg.write('Exif\0\0', 4, 'latin1');
  seg.write('MM', 10, 'latin1');
  seg.writeUInt16BE(42, 12);
  seg.writeUInt32BE(8, 14); // IFD0 right after the header
  seg.writeUInt16BE(1, 18); // one entry
  seg.writeUInt16BE(0x0112, 20);
  seg.writeUInt16BE(3, 22); // SHORT
  seg.writeUInt32BE(1, 24);
  seg.writeUInt16BE(orientation, 28);
  // Bytes 30-35: value padding and a zero next-IFD offset.
  return seg;
}

const PNG_SIGNATURE_LENGTH = 8;
const PNG_METADATA_CHUNKS = new Set(['eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME']);

export function stripPngMetadata(buf: Buffer): Buffer {
  if (buf.length < PNG_SIGNATURE_LENGTH) return buf;

  const out: Buffer[] = [buf.subarray(0, PNG_SIGNATURE_LENGTH)];
  let pos = PNG_SIGNATURE_LENGTH;

  while (pos + 12 <= buf.length) {
    // length + type + data + CRC
    const end = pos + 12 + buf.readUInt32BE(pos);
    if (end > buf.length) break;
    const type = buf.toString('latin1', pos + 4, pos + 8);
    if (!PNG_METADATA_CHUNKS.has(type)) out.push(buf.subarray(pos, end));
    pos = end;
    if (type === 'IEND') break;
  }
  out.push(buf.subarray(pos));
  return Buffer.concat(out);
}
