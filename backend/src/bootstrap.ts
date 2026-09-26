import type { NestExpressApplication } from '@nestjs/platform-express';
import type { ServerResponse } from 'node:http';
import type { Request, Response } from 'express';
import cookieParser from 'cookie-parser';
import { requestLogger } from './common/request-logger';
import { ImageService } from './image/image.service';
import { rateLimiter } from './common/security/rate-limiter';
import { MEDIA_PREFIX } from './common/schemas/image.schema';
import {
  CATALOGUE_UPLOAD_PURPOSES,
  EVIDENCE_UPLOAD_PURPOSE,
} from './image/image.schema';

/** NFR-SEC-05: signed URLs are unauthenticated, so an IP is all there is to key on. */
const MEDIA_RATE_LIMIT = 300;
const MEDIA_RATE_WINDOW_MS = 60 * 1000;

/** Uploaded content must never be executed or sniffed into something executable by the browser. */
function noSniffHeaders(res: ServerResponse): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
}

/**
 * Allowed origins for CORS.
 *
 * Never pair '*' with credentials:true — browsers refuse to send cookies to
 * a wildcard origin anyway, and this app uses a cookie as its auth token,
 * so a wide-open origin would let any site fire requests as a logged-in
 * user (CSRF).
 */
const DEV_ORIGINS = [
  'http://localhost:5173', // Vite dev server
  'http://localhost:4173', // vite preview
];

/**
 * CORS_ORIGINS (comma-separated) plus the dev servers outside production.
 *
 * Read on call, not at import: this file is imported before ConfigModule has
 * loaded .env. Production refuses to boot without it, because an empty list
 * blocks every request from the real frontend and looks like an outage.
 */
export function allowedOrigins(): string[] {
  const configured = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (process.env.NODE_ENV !== 'production')
    return [...DEV_ORIGINS, ...configured];
  if (configured.length === 0) {
    throw new Error(
      'CORS_ORIGINS must list the frontend origin(s) in production. See backend/.env.example.',
    );
  }
  return configured;
}

/**
 * Everything an app instance needs beyond what AppModule declares.
 *
 * A function rather than lines inside `bootstrap()`, because anything that
 * builds the app another way — the smoke test, an e2e suite — otherwise gets a
 * subtly different server: one with no cookies parsed and no `/media` mounted,
 * which then fails in ways that look like product bugs. That already happened
 * once here; the static mount was invisible to the smoke test until it was
 * moved in here.
 *
 * The raw body parser for uploads is deliberately *not* here — it lives in
 * AppModule.configure(), because Nest can scope middleware to a single route
 * and this cannot.
 */
export function configureApp(app: NestExpressApplication): void {
  // The one reverse proxy in front of this app (frontend/nginx.conf) sets
  // X-Real-IP and appends to X-Forwarded-For; trusting exactly one hop is
  // what makes req.ip mean the browser's address instead of nginx's own. Every
  // rate limiter below, and LoginThrottleService, depends on this being set -
  // without it every request looks like it comes from the proxy, and a
  // per-IP limit becomes a single limit shared by every visitor.
  // One hop is the frontend nginx. A TLS proxy in front of it (Caddy, host
  // nginx) adds a second, so production sets TRUST_PROXY_HOPS=2.
  app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS ?? 1));

  // Required, otherwise req.cookies is undefined and context can't find a session
  app.use(cookieParser());

  // One line per request. Registered with app.use rather than Nest's
  // MiddlewareConsumer because nestjs-trpc mounts /trpc straight onto Express,
  // so route-scoped Nest middleware would miss exactly the traffic worth
  // seeing. Adapted from feat/trpc-auth-connect via main.
  app.use(requestLogger);

  const images = app.get(ImageService);

  /**
   * Serve public catalogue photos (NFR-SEC-06).
   *
   * One static mount per catalogue purpose rather than one over the whole
   * media root: `ImageService.buildKey` files everything under
   * `<purpose>/YYYY/MM/<uuid>.ext`, so mounting only `CATALOGUE_UPLOAD_PURPOSES`
   * folders means the evidence folder (`EVIDENCE_UPLOAD_PURPOSE`, handled
   * below) is never reachable through Express's static file handler at all -
   * not "guarded", genuinely a different code path.
   *
   * Otherwise unauthenticated, and the URLs are unguessable rather than
   * protected: the filename is a random UUID. That is fine here - these are
   * public product photos, not personal data.
   */
  for (const purpose of CATALOGUE_UPLOAD_PURPOSES) {
    app.useStaticAssets(`${images.storageRoot}/${purpose}`, {
      prefix: `${MEDIA_PREFIX}${purpose}`,
      index: false,
      setHeaders: noSniffHeaders,
    });
  }

  /**
   * Serve evidence photos (NFR-SEC-06): before/after/inspection/appeal
   * photos, §5.8 classes these as personal data. Every read
   * (`ImageService.toPublicUrl`, used by `UsageImageService.list` and
   * `InspectionService.getSubject`) mints a fresh signed, expiring URL; this
   * is the other end of that contract, checked before a single byte is read
   * off disk.
   *
   * Deliberately hand-rolled rather than `useStaticAssets` with a guard in
   * front: a static-file middleware serving this folder at all is exactly
   * what NFR-SEC-06 says not to have, guarded or not.
   */
  app.use(
    `${MEDIA_PREFIX}${EVIDENCE_UPLOAD_PURPOSE}`,
    (req: Request, res: Response) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.status(404).end();
        return;
      }

      // NFR-SEC-05: unauthenticated, so the IP is all there is to key on.
      const ip = req.ip ?? 'unknown';
      if (
        !rateLimiter.consume(
          `media:${ip}`,
          MEDIA_RATE_LIMIT,
          MEDIA_RATE_WINDOW_MS,
        )
      ) {
        res.status(429).json({ code: 'TOO_MANY_REQUESTS' });
        return;
      }

      // `req.path` is already relative to the mount point above, e.g.
      // "/2026/09/<uuid>.jpg" - rebuilding the full key here is what
      // `ImageService.toPublicUrl` signed against.
      const key = `${EVIDENCE_UPLOAD_PURPOSE}${req.path}`;
      const exp = Number(req.query.exp);
      const sig = typeof req.query.sig === 'string' ? req.query.sig : '';

      if (!images.verifyEvidenceAccess(key, exp, sig)) {
        // Same answer for "bad signature" and "no such file" - see
        // ImageService.verifyEvidenceAccess's doc.
        res.status(403).end();
        return;
      }

      const file = images.resolveEvidenceFile(key);
      if (!file) {
        res.status(404).end();
        return;
      }

      noSniffHeaders(res);
      res.sendFile(file, (error: unknown) => {
        if (error) res.status(404).end();
      });
    },
  );

  app.enableCors({
    origin: allowedOrigins(),
    credentials: true,
    // PUT is the file upload. It is not a tRPC verb and never will be.
    methods: ['GET', 'POST', 'PUT', 'OPTIONS'],
  });
}
