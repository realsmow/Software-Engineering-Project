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
import { PrismaService } from '../../src/prisma.service';
import { StaffScopeService } from '../../src/common/authority/staff-scope.service';
import { requireIsolatedDatabase } from '../fixtures/isolated-database';
import { inHistoryFixture } from '../fixtures/borrower-history';
import { freezeBusinessDate } from '../fixtures/business-clock';
import {
  pickupFixture,
  pickupRequest,
  PICKUP_NOW,
  PICKUP_START,
} from '../fixtures/pickup';
import { allocateLoanInput, loanOutput } from '../../src/loan/loan.schema';

// A valid 1x1 PNG, not only a magic-byte stub: the same bytes must be readable
// at the URLs supplied to the supervisor's before/after image elements.
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jC1kAAAAASUVORK5CYII=',
  'base64',
);

describe('copied group photos remain readable after reloading', () => {
  let prisma: PrismaService;
  let termEnd: string | undefined;
  beforeAll(async () => {
    requireIsolatedDatabase();
    prisma = new PrismaService();
    await prisma.$connect();
    termEnd = process.env.TERM_END_DATE;
    delete process.env.TERM_END_DATE;
  });
  afterAll(async () => {
    if (termEnd === undefined) delete process.env.TERM_END_DATE;
    else process.env.TERM_END_DATE = termEnd;
    await prisma?.$disconnect();
  });
  beforeEach(() => freezeBusinessDate(PICKUP_NOW));
  afterEach(() => jest.useRealTimers());

  describe.each(['before', 'after'] as const)('%s photos', (stage) => {
    describe.each([
      { label: 'before URL expiration', elapsed: 14 * 60_000, expired: false },
      {
        label: 'exactly at URL expiration',
        elapsed: 15 * 60_000,
        expired: false,
      },
      {
        label: 'after URL expiration',
        elapsed: 15 * 60_000 + 1,
        expired: true,
      },
    ])('$label', ({ elapsed, expired }) => {
      let copiedStatus: number;
      beforeEach(async () => {
        await inHistoryFixture(prisma, async (tx) => {
          const f = await pickupFixture(tx);
          const usages: Array<ReturnType<typeof loanOutput.parse>> = [];
          for (const index of [0, 1]) {
            const reservation = await pickupRequest(f, 0, index);
            usages.push(
              loanOutput.strict().parse(
                await f.loan.allocate(
                  f.staff,
                  allocateLoanInput.parse({
                    reservationKey: reservation.reservationKey,
                  }),
                ),
              ),
            );
          }
          const values: Record<string, string> = {
            SESSION_SECRET: 'qa-group-photo-secret-'.repeat(3),
            PUBLIC_API_URL: 'http://localhost:3000',
          };
          const images = new ImageService(
            { get: (key: string) => values[key] } as ConfigService,
            f.client,
          );
          const evidence = new UsageImageService(
            f.client,
            new StaffScopeService(f.client),
            images,
          );
          const ticket = images.issueTicket(
            {
              purpose: 'inspection',
              contentType: 'image/png',
              sizeBytes: png.length,
            },
            f.staff.accountKey,
          );
          const verified = images.verifyTicket(
            ticket.uploadUrl.split('/uploads/')[1],
          );
          expect(verified).not.toBeNull();
          if (!verified)
            throw new Error('The group photo upload ticket did not verify');
          await images.store(verified, png, 'image/png');
          if (stage === 'after') {
            for (const usage of usages) {
              await evidence.attach(f.staff, {
                usageKey: usage.usageKey,
                stage: 'before',
                imageUrls: [ticket.imageUrl],
              });
            }
            jest.setSystemTime(PICKUP_START);
            for (const usage of usages) {
              expect(
                (
                  await f.loan.confirmPickup(f.staff, {
                    usageKey: usage.usageKey,
                  })
                ).status,
              ).toBe('Lended');
            }
          }
          const photoTime = Date.now();
          await evidence.attach(f.staff, {
            usageKey: usages[0].usageKey,
            stage,
            imageUrls: [ticket.imageUrl],
          });
          const source = usagePhotosOutput.parse(
            await evidence.list(f.staff, usages[0].usageKey),
          );
          expect(source[stage]).toHaveLength(1);
          // Payload produced by the actual bulk flow: read signed display URLs,
          // then attach them to the other usage; do not normalize in the test.
          await evidence.attach(f.staff, {
            usageKey: usages[1].usageKey,
            stage,
            imageUrls: source[stage].map((p) => p.imageUrl),
          });
          const copied = usagePhotosOutput.parse(
            await evidence.list(f.staff, usages[1].usageKey),
          );
          expect(copied[stage]).toHaveLength(1);
          expect(copied[stage][0].imageKey).not.toBe(source[stage][0].imageKey);
          expect(
            await tx.mediaFile.findUnique({ where: { Key: verified.key } }),
          ).not.toBeNull();
          const module = await Test.createTestingModule({
            providers: [
              { provide: ImageService, useValue: images },
              // Transaction delegates have no standalone $connect lifecycle.
              // Expose only the SQL delegate needed here, not Nest lifecycle hooks.
              {
                provide: PrismaService,
                useValue: { mediaFile: f.client.mediaFile },
              },
            ],
          }).compile();
          const app = module.createNestApplication<NestExpressApplication>();
          try {
            configureApp(app);
            await app.init();
            const getPhoto = (value: string) => {
              const url = new URL(value);
              return request(app.getHttpServer()).get(
                url.pathname + url.search,
              );
            };
            await getPhoto(source[stage][0].imageUrl).expect(200);
            await getPhoto(copied[stage][0].imageUrl).expect(200);
            jest.setSystemTime(new Date(photoTime + elapsed));
            if (expired) {
              // The old signature must actually be expired: ordinary HTTP control.
              await getPhoto(source[stage][0].imageUrl).expect(403);
            }
            const sourceReload = usagePhotosOutput.parse(
              await evidence.list(f.staff, usages[0].usageKey),
            );
            const targetReload = usagePhotosOutput.parse(
              await evidence.list(f.staff, usages[1].usageKey),
            );
            expect(sourceReload[stage]).toHaveLength(1);
            expect(targetReload[stage]).toHaveLength(1);
            expect(targetReload[stage][0].imageKey).toBe(
              copied[stage][0].imageKey,
            );
            const readableSource = await getPhoto(
              sourceReload[stage][0].imageUrl,
            )
              .expect(200)
              .expect('Content-Type', /image\/png/);
            const bytes = await images.read(verified.key);
            expect(bytes).not.toBeNull();
            expect(readableSource.body).toEqual(bytes!.bytes);
            // Capture HTTP status outside the failing assertion. SQL/app/setup
            // errors must still fail normally rather than satisfy the marker.
            const targetUrl = new URL(targetReload[stage][0].imageUrl);
            expect(targetUrl.pathname).toBe(ticket.imageUrl);
            const targetResponse = await getPhoto(targetUrl.toString());
            // Checked here, so a server/database/auth failure cannot be read
            // as the expired-signature defect the test below is about (#206).
            expect([200, 403]).toContain(targetResponse.status);
            if (targetResponse.status === 200) {
              expect(targetResponse.body).toEqual(bytes!.bytes);
            } else {
              expect(expired).toBe(true);
              expect(Number(targetUrl.searchParams.get('exp'))).toBeLessThan(
                Date.now(),
              );
              expect(
                images.verifyEvidenceAccess(
                  verified.key,
                  Number(targetUrl.searchParams.get('exp')),
                  targetUrl.searchParams.get('sig') ?? '',
                ),
              ).toBe(false);
            }
            copiedStatus = targetResponse.status;
          } finally {
            await app.close();
          }
        });
      });
      it(
        expired
          ? 'serves the copied photo after a fresh usagePhotos read instead of returning 403'
          : 'serves both original and copied photos while the initial signature is valid',
        () => {
          expect(copiedStatus).toBe(200);
        },
      );
    });
  });
});

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
          // Photos live in the MediaFile table; an in-memory stand-in here.
          provide: PrismaService,
          useValue: (() => {
            const files = new Map<string, unknown>();
            return {
              mediaFile: {
                create: ({ data }: { data: { Key: string } }) => {
                  files.set(data.Key, data);
                  return Promise.resolve(data);
                },
                findUnique: ({ where }: { where: { Key: string } }) =>
                  Promise.resolve(files.get(where.Key) ?? null),
              },
            };
          })(),
        },
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

  it('returns before, after and appeal evidence URLs that load the uploaded PNG through the real media mount', async () => {
    const rows: Array<{
      ImageKey: number;
      ImageURL: string;
      SubmissionType: 'BeforePicture' | 'AfterPicture' | 'AppealEvidence';
      SubmittedBy: number;
      ActionTime: Date;
    }> = [];
    for (const [index, stage] of (
      ['BeforePicture', 'AfterPicture', 'AppealEvidence'] as const
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
    expect(photos.evidence).toHaveLength(1);
    for (const photo of [
      ...photos.before,
      ...photos.after,
      ...photos.evidence,
    ]) {
      const url = new URL(photo.imageUrl);
      expect(url.origin).toBe('http://localhost:3000');
      expect(url.searchParams.has('sig')).toBe(true);
      expect(Number(url.searchParams.get('exp'))).toBeGreaterThan(Date.now());
      const response = await request(app.getHttpServer())
        .get(url.pathname + url.search)
        .expect(200)
        .expect('Content-Type', /image\/png/)
        .expect('X-Content-Type-Options', 'nosniff');
      expect(response.body).toEqual(png);
      await request(app.getHttpServer()).get(url.pathname).expect(403);
      const forged = new URL(url);
      forged.searchParams.set('sig', 'forged');
      await request(app.getHttpServer())
        .get(forged.pathname + forged.search)
        .expect(403);
      const clock = jest
        .spyOn(Date, 'now')
        .mockReturnValue(Number(url.searchParams.get('exp')) + 1);
      try {
        // Keep the original signature valid, and move past its expiry.
        await request(app.getHttpServer())
          .get(url.pathname + url.search)
          .expect(403);
      } finally {
        clock.mockRestore();
      }
    }
  });
});
