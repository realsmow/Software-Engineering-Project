import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ConfigService } from '@nestjs/config';
import { ImageService } from './image.service';
import { MAX_UPLOAD_BYTES } from '../common/schemas/image.schema';
import type { RequestUploadInput } from './image.schema';

/**
 * The upload path is the only route in the API with no session behind it, so
 * these cover what stands in for one: the ticket signature, its expiry, and the
 * checks on the bytes that actually arrive.
 *
 * Real files, in a temp directory — the point of most of this is what lands on
 * disk, and a mocked `fs` would test the mock.
 */

const SECRET = 'x'.repeat(48);

const PNG_HEADER = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_HEADER = [0xff, 0xd8, 0xff];

function pngBytes(padding = 16): Buffer {
  return Buffer.concat([Buffer.from(PNG_HEADER), Buffer.alloc(padding, 1)]);
}

function serviceIn(mediaRoot: string, overrides: Record<string, string> = {}) {
  const values: Record<string, string> = {
    SESSION_SECRET: SECRET,
    MEDIA_ROOT: mediaRoot,
    PUBLIC_API_URL: 'http://localhost:3000',
    ...overrides,
  };

  const config = {
    get: (key: string) => values[key],
  } as unknown as ConfigService;

  return new ImageService(config);
}

const REQUEST: RequestUploadInput = {
  purpose: 'itemType',
  contentType: 'image/png',
  sizeBytes: 1024,
};

describe('ImageService', () => {
  let mediaRoot: string;
  let service: ImageService;

  beforeEach(async () => {
    mediaRoot = await mkdtemp(join(tmpdir(), 'ulms-media-'));
    service = serviceIn(mediaRoot);
  });

  afterEach(async () => {
    await rm(mediaRoot, { recursive: true, force: true });
  });

  describe('issueTicket', () => {
    it('returns an absolute upload URL and a relative image URL', () => {
      const ticket = service.issueTicket(REQUEST, 7);

      // The browser PUTs to an absolute URL; the database stores the relative
      // one, so moving the API to another host does not rewrite every row.
      expect(
        ticket.uploadUrl.startsWith('http://localhost:3000/uploads/'),
      ).toBe(true);
      expect(ticket.imageUrl.startsWith('/media/itemType/')).toBe(true);
      expect(ticket.previewUrl).toBe(`http://localhost:3000${ticket.imageUrl}`);
    });

    it('names the file after a UUID, never after anything the client sent', () => {
      const ticket = service.issueTicket(REQUEST, 7);

      expect(ticket.imageUrl).toMatch(
        /^\/media\/itemType\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.png$/,
      );
    });

    it('gives two requests different keys', () => {
      const first = service.issueTicket(REQUEST, 7);
      const second = service.issueTicket(REQUEST, 7);

      expect(first.imageUrl).not.toBe(second.imageUrl);
    });

    it('uses the extension of the declared type', () => {
      const ticket = service.issueTicket(
        { ...REQUEST, contentType: 'image/jpeg' },
        7,
      );

      expect(ticket.imageUrl.endsWith('.jpg')).toBe(true);
    });
  });

  describe('verifyTicket', () => {
    it('accepts a ticket it just issued', () => {
      const { uploadUrl } = service.issueTicket(REQUEST, 7);
      const token = uploadUrl.split('/uploads/')[1];

      expect(service.verifyTicket(token)).toMatchObject({
        contentType: 'image/png',
        sizeBytes: 1024,
        accountKey: 7,
      });
    });

    it('rejects a ticket signed with a different secret', () => {
      // i.e. forged elsewhere, or issued before a secret rotation.
      const other = serviceIn(mediaRoot, { SESSION_SECRET: 'y'.repeat(48) });
      const token = other
        .issueTicket(REQUEST, 7)
        .uploadUrl.split('/uploads/')[1];

      expect(service.verifyTicket(token)).toBeNull();
    });

    it('rejects a tampered payload', () => {
      const token = service
        .issueTicket(REQUEST, 7)
        .uploadUrl.split('/uploads/')[1];
      const [payload, signature] = token.split('.');

      // Re-sign nothing, just swap the payload: the signature no longer matches.
      const forged = `${Buffer.from('{"key":"../../etc/passwd"}').toString('base64url')}.${signature}`;
      expect(service.verifyTicket(forged)).toBeNull();
      expect(payload).not.toBe('');
    });

    it('rejects an expired ticket', () => {
      const token = service
        .issueTicket(REQUEST, 7)
        .uploadUrl.split('/uploads/')[1];

      // Ten minutes and change later.
      jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 11 * 60 * 1000);
      expect(service.verifyTicket(token)).toBeNull();
      jest.restoreAllMocks();
    });

    it('rejects rubbish', () => {
      expect(service.verifyTicket('')).toBeNull();
      expect(service.verifyTicket('not-a-token')).toBeNull();
    });
  });

  describe('store', () => {
    function ticketFor(input: RequestUploadInput = REQUEST) {
      const token = service
        .issueTicket(input, 7)
        .uploadUrl.split('/uploads/')[1];
      return service.verifyTicket(token)!;
    }

    it('writes the file and returns the URL to store', async () => {
      const ticket = ticketFor();
      const body = pngBytes();

      const url = await service.store(ticket, body, 'image/png');

      expect(url).toBe(`/media/${ticket.key}`);
      await expect(readFile(join(mediaRoot, ticket.key))).resolves.toEqual(
        body,
      );
    });

    it('refuses a Content-Type other than the one the ticket was issued for', async () => {
      const ticket = ticketFor();

      await expect(
        service.store(ticket, Buffer.from(JPEG_HEADER), 'image/jpeg'),
      ).rejects.toMatchObject({ message: 'UPLOAD_TYPE_MISMATCH' });
    });

    it('refuses bytes that do not start like the type they claim to be', async () => {
      // A declared Content-Type is a claim; the signature is the evidence.
      const ticket = ticketFor();
      const disguised = Buffer.from('#!/bin/sh\necho hello\n');

      await expect(
        service.store(ticket, disguised, 'image/png'),
      ).rejects.toMatchObject({
        message: 'UPLOAD_NOT_AN_IMAGE',
      });
    });

    it('refuses a body larger than the size the ticket was issued for', async () => {
      const ticket = ticketFor({ ...REQUEST, sizeBytes: 32 });

      await expect(
        service.store(ticket, pngBytes(64), 'image/png'),
      ).rejects.toMatchObject({
        message: 'UPLOAD_TOO_LARGE',
      });
    });

    it('refuses an empty body', async () => {
      const ticket = ticketFor();

      await expect(
        service.store(ticket, Buffer.alloc(0), 'image/png'),
      ).rejects.toMatchObject({ message: 'UPLOAD_EMPTY' });
    });

    it('refuses to overwrite a file that already exists', async () => {
      // A replayed ticket must not be able to swap the photo under a record
      // that already references it.
      const ticket = ticketFor();
      await service.store(ticket, pngBytes(), 'image/png');

      await expect(
        service.store(ticket, pngBytes(32), 'image/png'),
      ).rejects.toMatchObject({ message: 'UPLOAD_ALREADY_STORED' });
    });

    it('never writes outside the media root', async () => {
      // The key is signed, so this cannot happen through the API — the guard is
      // for a future bug that lets a caller influence it.
      const escaping = { ...ticketFor(), key: '../escaped.png' };

      await expect(
        service.store(escaping, pngBytes(), 'image/png'),
      ).rejects.toMatchObject({
        message: 'UPLOAD_REJECTED',
      });
    });
  });

  describe('URL conversion', () => {
    it('folds our own absolute URL back to the stored relative form', () => {
      expect(
        service.toStoredUrl('http://localhost:3000/media/room/2026/08/a.png'),
      ).toBe('/media/room/2026/08/a.png');
    });

    it('keeps a genuinely external URL as it was given', () => {
      const external = 'https://example.com/product.jpg';
      expect(service.toStoredUrl(external)).toBe(external);
    });

    it('leaves an already-relative path alone', () => {
      expect(service.toStoredUrl('/media/room/2026/08/a.png')).toBe(
        '/media/room/2026/08/a.png',
      );
    });

    it('absolutises a stored path on the way out', () => {
      expect(service.toPublicUrl('/media/room/2026/08/a.png')).toBe(
        'http://localhost:3000/media/room/2026/08/a.png',
      );
    });

    it('passes an external URL straight through on the way out', () => {
      expect(service.toPublicUrl('https://example.com/product.jpg')).toBe(
        'https://example.com/product.jpg',
      );
    });

    it('survives a round trip through both conversions', () => {
      const stored = '/media/itemType/2026/08/a.png';
      expect(service.toStoredUrl(service.toPublicUrl(stored)!)).toBe(stored);
    });

    it('maps null and empty to null rather than to a bare host', () => {
      expect(service.toPublicUrl(null)).toBeNull();
      expect(service.toPublicUrl('')).toBeNull();
    });
  });

  it('caps the advertised limit at the global maximum', () => {
    const ticket = service.issueTicket(
      { ...REQUEST, sizeBytes: MAX_UPLOAD_BYTES },
      7,
    );

    expect(ticket.maxBytes).toBe(MAX_UPLOAD_BYTES);
  });
});
