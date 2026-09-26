import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { configureApp } from '../../src/bootstrap';
import { ImageService } from '../../src/image/image.service';
import { UsageImageService } from '../../src/image/usage-image.service';
import type { TrpcUser } from '../../src/trpc/context';
import { usagePhotosOutput } from '../../src/image/image.schema';

// A valid 1x1 PNG, not only a magic-byte stub: the same bytes must be readable
// at the URLs supplied to the supervisor's before/after image elements.
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jC1kAAAAASUVORK5CYII=',
  'base64',
);

describe('PDF p. 20: appeal evidence is served over HTTP', () => {
  let app: NestExpressApplication;
  let mediaRoot: string;
  let images: ImageService;

  beforeAll(async () => {
    mediaRoot = await mkdtemp(join(tmpdir(), 'ulms-appeal-http-'));
    const values: Record<string, string> = {
      SESSION_SECRET: 'test-secret-'.repeat(5),
      MEDIA_ROOT: mediaRoot,
      PUBLIC_API_URL: 'http://localhost:3000',
    };
    const module = await Test.createTestingModule({
      providers: [
        ImageService,
        {
          provide: ConfigService,
          useValue: { get: (key: string) => values[key] },
        },
      ],
    }).compile();
    app = module.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
    images = app.get(ImageService);
  });

  afterAll(async () => {
    await app?.close();
    if (mediaRoot) await rm(mediaRoot, { recursive: true, force: true });
  });

  it('returns before and after URLs that load the uploaded PNG through the real media mount', async () => {
    const rows: Array<{
      ImageKey: number;
      ImageURL: string;
      SubmissionType: 'BeforePicture' | 'AfterPicture';
      SubmittedBy: number;
      ActionTime: Date;
    }> = [];
    for (const [index, stage] of (
      ['BeforePicture', 'AfterPicture'] as const
    ).entries()) {
      const ticket = images.issueTicket(
        {
          purpose: 'inspection',
          contentType: 'image/png',
          sizeBytes: png.length,
        },
        11,
      );
      const verified = images.verifyTicket(
        ticket.uploadUrl.split('/uploads/')[1],
      );
      expect(verified).not.toBeNull();
      if (!verified) throw new Error('The issued ticket did not verify');
      const imageUrl = await images.store(verified, png, 'image/png');
      rows.push({
        ImageKey: index + 1,
        ImageURL: imageUrl,
        SubmissionType: stage,
        SubmittedBy: 11,
        ActionTime: new Date(),
      });
    }
    const prisma = {
      usageLog: {
        findUnique: jest.fn().mockResolvedValue({
          UsageKey: 41,
          AccountKey: 11,
          ResourceKey: 8,
          CurrentStatus: 'Inspected',
        }),
      },
      images: { findMany: jest.fn().mockResolvedValue(rows) },
    };
    const scope = {
      assertResourceInScope: jest.fn().mockResolvedValue(undefined),
    };
    const evidence = new UsageImageService(
      prisma as never,
      scope as never,
      images,
    );
    const supervisor: TrpcUser = {
      accountKey: 22,
      role: 'supervisor',
      facultyKey: null,
      creditScore: 100,
    };
    const photos = usagePhotosOutput.parse(await evidence.list(supervisor, 41));
    expect(scope.assertResourceInScope).toHaveBeenCalledWith(supervisor, 8);
    expect(photos.before).toHaveLength(1);
    expect(photos.after).toHaveLength(1);
    for (const photo of [...photos.before, ...photos.after]) {
      // Evidence URLs are absolute and signed; supertest wants path + query.
      const url = new URL(photo.imageUrl);
      const response = await request(app.getHttpServer())
        .get(url.pathname + url.search)
        .expect(200)
        .expect('Content-Type', /image\/png/)
        .expect('X-Content-Type-Options', 'nosniff');
      expect(response.body).toEqual(png);
    }
  });
});
