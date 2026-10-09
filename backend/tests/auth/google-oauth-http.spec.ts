import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Controller, Get, Req } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Request } from 'express';
import { generateKeyPairSync, sign } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import request from 'supertest';
import { PrismaService } from '../../src/prisma.service';
import { configureApp } from '../../src/bootstrap';
import { GoogleAuthController } from '../../src/auth/google-auth.controller';
import { GoogleOAuthService } from '../../src/auth/google-oauth.service';
import { SessionService, SESSION_COOKIE } from '../../src/auth/session.service';
import { AuditService } from '../../src/common/audit/audit.service';
import { ImageService } from '../../src/image/image.service';
import { historyFixture, inHistoryFixture } from '../fixtures/borrower-history';
import {
  createIsolatedDatabase,
  type IsolatedTestDatabase,
} from '../fixtures/isolated-database';
import { freezeBusinessDate } from '../fixtures/business-clock';

const CLIENT_ID = 'fixture.apps.googleusercontent.com';
const APP_URL = 'http://localhost:5173';
const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = {
  ...keys.publicKey.export({ format: 'jwk' }),
  kid: 'fixture-key',
  alg: 'RS256',
  use: 'sig',
};

function idToken(email: string): string {
  const header = Buffer.from(
    JSON.stringify({ alg: 'RS256', kid: jwk.kid }),
  ).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      iss: 'https://accounts.google.com',
      aud: CLIENT_ID,
      sub: 'fixture-subject',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
      email,
      email_verified: true,
    }),
  ).toString('base64url');
  const data = `${header}.${payload}`;
  return `${data}.${sign('RSA-SHA256', Buffer.from(data), keys.privateKey).toString('base64url')}`;
}

function cookie(headers: string | string[] | undefined, name: string): string {
  const values = Array.isArray(headers) ? headers : headers ? [headers] : [];
  const found = values.find((value) => value.startsWith(`${name}=`));
  if (!found) throw new Error(`Expected ${name} cookie`);
  return found.split(';')[0];
}

// A test-only route lets the real cookie parser and SessionService read the
// issued cookie from an HTTP request rather than a hand-built Express object.
@Controller('_tests')
class SessionProbe {
  constructor(private readonly session: SessionService) {}
  @Get('session')
  async identity(@Req() req: Request) {
    return { accountKey: await this.session.read(req) };
  }
}

describe('FR-AUTH-01/02 and FR-ADM-05: enabled Google OAuth over HTTP', () => {
  let prisma: PrismaService;
  let database: IsolatedTestDatabase | undefined;
  let clock = Date.parse('2031-09-26T00:00:00.000Z');
  beforeAll(async () => {
    database = await createIsolatedDatabase('oauth', {
      seedReferenceData: true,
    });
    prisma = database.client;
  }, 60_000);
  afterAll(async () => database?.dispose());
  beforeEach(() => {
    clock += 61_000;
    freezeBusinessDate(new Date(clock));
  });
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  async function withOAuth(
    work: (
      f: Awaited<ReturnType<typeof historyFixture>>,
      app: NestExpressApplication,
    ) => Promise<void>,
    production = false,
  ) {
    await inHistoryFixture(prisma, async (tx) => {
      const f = await historyFixture(tx);
      const role = await tx.roleInfo.findFirstOrThrow({
        where: { RoleName: 'Student' },
      });
      f.borrower = await tx.accountInfo.update({
        where: { AccountKey: f.borrower.AccountKey },
        data: { Email: `${f.borrower.UserID}@ku.th`, RoleKey: role.RoleKey },
      });
      const config = new ConfigService({
        GOOGLE_CLIENT_ID: CLIENT_ID,
        GOOGLE_CLIENT_SECRET: 'fixture-secret',
        GOOGLE_REDIRECT_URI: 'http://localhost:3000/auth/google/callback',
        SESSION_SECRET: 'oauth-test-secret-'.repeat(4),
        ALLOWED_EMAIL_DOMAINS: 'ku.th',
        PUBLIC_APP_URL: `${APP_URL}/`,
        NODE_ENV: production ? 'production' : 'test',
        MEDIA_ROOT: join(tmpdir(), 'ulms-oauth-no-uploads'),
      });
      const google = new GoogleOAuthService(config, f.client);
      const session = new SessionService(config, f.client);
      const module = await Test.createTestingModule({
        controllers: [GoogleAuthController, SessionProbe],
        providers: [
          { provide: ConfigService, useValue: config },
          { provide: GoogleOAuthService, useValue: google },
          { provide: SessionService, useValue: session },
          { provide: AuditService, useValue: new AuditService(f.client) },
          { provide: PrismaService, useValue: f.client },
          ImageService,
        ],
      }).compile();
      const app = module.createNestApplication<NestExpressApplication>();
      try {
        configureApp(app);
        await app.init();
        await work(f, app);
      } finally {
        await app.close();
      }
    });
  }

  function googleResponses(token: string, status = 200) {
    // Only external Google endpoints are simulated. Local signature checks,
    // domain/account checks, sessions, redirects and audit writes remain real.
    return jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (url, init) => {
        const address =
          typeof url === 'string'
            ? url
            : url instanceof URL
              ? url.href
              : url.url;
        if (address === 'https://oauth2.googleapis.com/token') {
          expect(init?.method).toBe('POST');
          if (!(init?.body instanceof URLSearchParams))
            throw new Error('Expected URL-encoded OAuth parameters');
          const body = init.body;
          expect(body.get('grant_type')).toBe('authorization_code');
          expect(body.get('client_id')).toBe(CLIENT_ID);
          expect(body.get('redirect_uri')).toBe(
            'http://localhost:3000/auth/google/callback',
          );
          return Response.json({ id_token: token }, { status });
        }
        if (address === 'https://www.googleapis.com/oauth2/v3/certs')
          return Response.json({ keys: [jwk] });
        throw new Error(`Unexpected network request: ${address}`);
      });
  }

  async function start(app: NestExpressApplication) {
    const response = await request(app.getHttpServer())
      .get('/auth/google')
      .expect(302);
    const location = new URL(response.headers.location);
    const state = location.searchParams.get('state');
    expect(state).toBeTruthy();
    return {
      response,
      location,
      state: state!,
      cookie: cookie(response.headers['set-cookie'], 'ulms_oauth_state'),
    };
  }

  it('starts the configured authorization flow with a signed HttpOnly state cookie and production Secure flag', async () => {
    await withOAuth(async (_f, app) => {
      const opened = await start(app);
      expect(opened.location.origin).toBe('https://accounts.google.com');
      expect(opened.location.searchParams.get('client_id')).toBe(CLIENT_ID);
      expect(opened.location.searchParams.get('response_type')).toBe('code');
      expect(opened.location.searchParams.get('scope')).toBe(
        'openid email profile',
      );
      expect(opened.location.searchParams.get('hd')).toBe('ku.th');
      const raw = opened.response.headers['set-cookie'];
      const cookies = Array.isArray(raw) ? raw : [raw];
      expect(cookies.join(';')).toMatch(/HttpOnly/);
      expect(cookies.join(';')).toMatch(/Secure/);
      expect(cookies.join(';')).toMatch(/SameSite=Lax/);
      expect(cookies.join(';')).toMatch(/Path=\/auth\/google/);
      const signed = decodeURIComponent(
        opened.cookie.split('=').slice(1).join('='),
      );
      expect(app.get(GoogleOAuthService).readState(signed)).toBe(opened.state);
    }, true);
  });

  it('verifies a signed KU token, persists one usable session and audit row, and refuses a callback replay after cookie removal', async () => {
    await withOAuth(async (f, app) => {
      const fetch = googleResponses(idToken(f.borrower.Email.toUpperCase()));
      const agent = request.agent(app.getHttpServer());
      const opened = await agent.get('/auth/google').expect(302);
      const state = new URL(opened.headers.location).searchParams.get('state');
      const response = await agent
        .get('/auth/google/callback')
        .query({ code: 'fixture-code', state })
        .set('User-Agent', 'OAuth integration test')
        .expect(302);
      expect(response.headers.location).toBe(APP_URL);
      const sessionCookie = cookie(
        response.headers['set-cookie'],
        SESSION_COOKIE,
      );
      expect(sessionCookie).toMatch(/^ulms_session=/);
      const identity = await agent.get('/_tests/session').expect(200);
      expect(identity.body as unknown).toEqual({
        accountKey: f.borrower.AccountKey,
      });
      expect(
        await f.client.sessionInfo.count({
          where: { AccountKey: f.borrower.AccountKey },
        }),
      ).toBe(1);
      expect(
        await f.client.auditLog.findMany({
          where: { ActorKey: f.borrower.AccountKey },
        }),
      ).toMatchObject([
        {
          Action: 'login',
          ActorRole: 'borrower',
          Target: `account/${f.borrower.AccountKey}`,
          UserAgent: 'OAuth integration test',
          Detail: 'Signed in with a Google account',
        },
      ]);
      const replay = await agent
        .get('/auth/google/callback')
        .query({ code: 'fixture-code', state })
        .expect(302);
      expect(replay.headers.location).toBe(
        `${APP_URL}/login?error=SERVER_ERROR`,
      );
      expect(fetch).toHaveBeenCalledTimes(2); // One token exchange and one JWKS fetch.
      expect(
        await f.client.sessionInfo.count({
          where: { AccountKey: f.borrower.AccountKey },
        }),
      ).toBe(1);
    });
  });

  it.each([
    'missing-cookie',
    'forged-cookie',
    'wrong-state',
    'missing-code',
  ] as const)(
    'rejects %s before exchanging a code or issuing a session',
    async (variant) => {
      await withOAuth(async (f, app) => {
        const fetch = googleResponses(idToken(f.borrower.Email));
        const opened = await start(app);
        const callback = request(app.getHttpServer())
          .get('/auth/google/callback')
          .query({
            state: variant === 'wrong-state' ? 'different-state' : opened.state,
            ...(variant === 'missing-code' ? {} : { code: 'fixture-code' }),
          });
        if (variant !== 'missing-cookie')
          callback.set(
            'Cookie',
            variant === 'forged-cookie'
              ? 'ulms_oauth_state=forged.signature'
              : opened.cookie,
          );
        const response = await callback.expect(302);
        expect(response.headers.location).toBe(
          `${APP_URL}/login?error=SERVER_ERROR`,
        );
        expect(fetch).not.toHaveBeenCalled();
        expect(
          await f.client.sessionInfo.count({
            where: { AccountKey: f.borrower.AccountKey },
          }),
        ).toBe(0);
        expect(
          await f.client.auditLog.count({
            where: { ActorKey: f.borrower.AccountKey },
          }),
        ).toBe(0);
      });
    },
  );

  it.each([
    { kind: 'outside KU', code: 'INVALID_DOMAIN' },
    { kind: 'unknown account', code: 'ACCOUNT_NOT_FOUND' },
    { kind: 'disabled account', code: 'ACCOUNT_DISABLED' },
    { kind: 'forged signature', code: 'SERVER_ERROR' },
    { kind: 'failed token exchange', code: 'SERVER_ERROR' },
  ])(
    'redirects $kind to $code without provisioning an account or session',
    async ({ kind, code }) => {
      await withOAuth(async (f, app) => {
        if (kind === 'disabled account')
          await f.client.accountInfo.update({
            where: { AccountKey: f.borrower.AccountKey },
            data: { IsActive: false },
          });
        const email =
          kind === 'outside KU'
            ? 'person@example.test'
            : kind === 'unknown account'
              ? `${f.borrower.UserID}-unknown@ku.th`
              : f.borrower.Email;
        let token = idToken(email);
        if (kind === 'forged signature') {
          const parts = token.split('.');
          const signature = Buffer.from(parts[2], 'base64url');
          signature[0] ^= 1;
          token = `${parts[0]}.${parts[1]}.${signature.toString('base64url')}`;
        }
        googleResponses(token, kind === 'failed token exchange' ? 503 : 200);
        const accounts = await f.client.accountInfo.count();
        const opened = await start(app);
        const response = await request(app.getHttpServer())
          .get('/auth/google/callback')
          .set('Cookie', opened.cookie)
          .query({ code: 'fixture-code', state: opened.state })
          .expect(302);
        expect(response.headers.location).toBe(
          `${APP_URL}/login?error=${code}`,
        );
        expect(await f.client.accountInfo.count()).toBe(accounts);
        expect(
          await f.client.sessionInfo.count({
            where: { AccountKey: f.borrower.AccountKey },
          }),
        ).toBe(0);
        expect(
          await f.client.auditLog.count({
            where: { ActorKey: f.borrower.AccountKey },
          }),
        ).toBe(0);
      });
    },
  );

  it('shares the real per-IP rate limit between authorization and callback routes', async () => {
    await withOAuth(async (f, app) => {
      const fetch = googleResponses(idToken(f.borrower.Email));
      for (let count = 0; count < 20; count++)
        await request(app.getHttpServer()).get('/auth/google').expect(302);
      const limited = await request(app.getHttpServer())
        .get('/auth/google/callback')
        .query({ code: 'fixture-code', state: 'state' })
        .expect(429);
      expect(limited.body as unknown).toEqual({ code: 'TOO_MANY_REQUESTS' });
      expect(fetch).not.toHaveBeenCalled();
    });
  });
});
