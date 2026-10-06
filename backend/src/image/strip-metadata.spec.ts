import { stripJpegMetadata, stripPngMetadata } from './strip-metadata';

function segment(marker: number, payload: Buffer): Buffer {
  const head = Buffer.alloc(4);
  head.writeUInt16BE(0xff00 | marker, 0);
  head.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([head, payload]);
}

/** EXIF APP1 (little-endian) with Orientation, Make and a GPS pointer. */
function exifApp1(orientation: number): Buffer {
  const tiff = Buffer.alloc(8 + 2 + 3 * 12 + 4 + 6);
  tiff.write('II', 0, 'latin1');
  tiff.writeUInt16LE(42, 2);
  tiff.writeUInt32LE(8, 4);
  tiff.writeUInt16LE(3, 8);
  // Make -> "Apple" stored after the IFD
  tiff.writeUInt16LE(0x010f, 10);
  tiff.writeUInt16LE(2, 12);
  tiff.writeUInt32LE(6, 14);
  tiff.writeUInt32LE(50, 18);
  tiff.writeUInt16LE(0x0112, 22);
  tiff.writeUInt16LE(3, 24);
  tiff.writeUInt32LE(1, 26);
  tiff.writeUInt16LE(orientation, 30);
  tiff.writeUInt16LE(0x8825, 34); // GPS IFD pointer
  tiff.writeUInt16LE(4, 36);
  tiff.writeUInt32LE(1, 38);
  tiff.writeUInt32LE(0, 42);
  tiff.write('Apple\0', 50, 'latin1');
  return segment(
    0xe1,
    Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]),
  );
}

const SOI = Buffer.from([0xff, 0xd8]);
const JFIF = segment(
  0xe0,
  Buffer.from('JFIF\0\x01\x01\0\0\x01\0\x01\0\0', 'latin1'),
);
const XMP = segment(
  0xe1,
  Buffer.from('http://ns.adobe.com/xap/1.0/\0<gps/>', 'latin1'),
);
const COMMENT = segment(0xfe, Buffer.from('iPhone 15', 'latin1'));
const QUANT = segment(0xdb, Buffer.alloc(65, 2));
const SCAN = Buffer.concat([
  segment(0xda, Buffer.alloc(10, 3)),
  Buffer.from([0x12, 0xff, 0x00, 0x34, 0xff, 0xd9]),
]);

describe('stripJpegMetadata', () => {
  it('drops EXIF, XMP and comments but keeps JFIF, tables and scan data', () => {
    const input = Buffer.concat([
      SOI,
      JFIF,
      exifApp1(1),
      XMP,
      COMMENT,
      QUANT,
      SCAN,
    ]);
    const out = stripJpegMetadata(input);

    expect(out).toEqual(Buffer.concat([SOI, JFIF, QUANT, SCAN]));
    expect(out.includes('Apple')).toBe(false);
    expect(out.includes('iPhone')).toBe(false);
  });

  it('writes the orientation back alone so portrait photos stay upright', () => {
    const input = Buffer.concat([SOI, JFIF, exifApp1(6), QUANT, SCAN]);
    const out = stripJpegMetadata(input);

    expect(out.includes('Apple')).toBe(false);
    expect(out.subarray(0, 2 + JFIF.length)).toEqual(
      Buffer.concat([SOI, JFIF]),
    );
    const app1 = out.subarray(2 + JFIF.length, 2 + JFIF.length + 36);
    expect(app1.readUInt16BE(0)).toBe(0xffe1);
    expect(app1.toString('latin1', 4, 12)).toBe('Exif\0\0MM');
    expect(app1.readUInt16BE(20)).toBe(0x0112);
    expect(app1.readUInt16BE(28)).toBe(6);
    expect(out.subarray(2 + JFIF.length + 36)).toEqual(
      Buffer.concat([QUANT, SCAN]),
    );
  });

  it('copies a body it cannot parse unchanged', () => {
    const odd = Buffer.from([0xff, 0xd8, 0xff]);
    expect(stripJpegMetadata(odd)).toEqual(odd);
  });
});

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  return Buffer.concat([
    len,
    Buffer.from(type, 'latin1'),
    data,
    Buffer.alloc(4),
  ]);
}

describe('stripPngMetadata', () => {
  it('drops eXIf and text chunks and keeps image chunks', () => {
    const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const ihdr = chunk('IHDR', Buffer.alloc(13, 1));
    const idat = chunk('IDAT', Buffer.alloc(20, 5));
    const iend = chunk('IEND', Buffer.alloc(0));
    const input = Buffer.concat([
      sig,
      ihdr,
      chunk('eXIf', Buffer.from('MM\0*Apple', 'latin1')),
      chunk('tEXt', Buffer.from('Model\0iPhone 15', 'latin1')),
      idat,
      chunk('tIME', Buffer.alloc(7)),
      iend,
    ]);

    expect(stripPngMetadata(input)).toEqual(
      Buffer.concat([sig, ihdr, idat, iend]),
    );
  });
});
