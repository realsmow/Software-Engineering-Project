import { imageUrl, matchesMagicBytes } from './image.schema';

/**
 * `ImageURL` is rendered into an `<img src>`, so what this validator lets
 * through is a security boundary, not a formatting preference.
 */
describe('imageUrl', () => {
  it.each([
    '/media/itemType/2026/08/a1b2.png',
    'http://localhost:3000/media/room/2026/08/x.jpg',
    'https://example.com/catalogue/arduino.jpg',
  ])('accepts %s', (value) => {
    expect(imageUrl.safeParse(value).success).toBe(true);
  });

  it.each([
    // Stored XSS: these execute when the browser renders the tag.
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
    'vbscript:msgbox(1)',
    // Not a URL at all.
    'not a url',
    '',
    // Traversal dressed up as one of ours.
    '/media/../../etc/passwd',
  ])('rejects %s', (value) => {
    expect(imageUrl.safeParse(value).success).toBe(false);
  });

  it('rejects a value longer than the column allows', () => {
    expect(
      imageUrl.safeParse(`https://example.com/${'a'.repeat(600)}`).success,
    ).toBe(false);
  });
});

describe('matchesMagicBytes', () => {
  it('accepts a real PNG header', () => {
    const png = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
    ]);
    expect(matchesMagicBytes(png, 'image/png')).toBe(true);
  });

  it('accepts a real JPEG header', () => {
    expect(
      matchesMagicBytes(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), 'image/jpeg'),
    ).toBe(true);
  });

  it('rejects a JPEG offered as a PNG', () => {
    expect(
      matchesMagicBytes(Buffer.from([0xff, 0xd8, 0xff]), 'image/png'),
    ).toBe(false);
  });

  it('rejects a script that claims to be a PNG', () => {
    expect(matchesMagicBytes(Buffer.from('#!/bin/sh'), 'image/png')).toBe(
      false,
    );
  });

  it('rejects a body too short to hold the signature', () => {
    expect(matchesMagicBytes(Buffer.from([0x89, 0x50]), 'image/png')).toBe(
      false,
    );
  });
});
