import type { NestExpressApplication } from '@nestjs/platform-express';
import type { ServerResponse } from 'node:http';
import cookieParser from 'cookie-parser';
import { requestLogger } from './common/request-logger';
import { ImageService } from './image/image.service';
import { MEDIA_PREFIX } from './common/schemas/image.schema';

/**
 * Allowed origins for CORS.
 *
 * Never pair '*' with credentials:true — browsers refuse to send cookies to
 * a wildcard origin anyway, and this app uses a cookie as its auth token,
 * so a wide-open origin would let any site fire requests as a logged-in
 * user (CSRF).
 */
export const ALLOWED_ORIGINS = [
  'http://localhost:5173', // Vite dev server
  'http://localhost:4173', // vite preview
  // TODO: add the production frontend origin once it's known
];

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
  // Required, otherwise req.cookies is undefined and context can't find a session
  app.use(cookieParser());

  // One line per request. Registered with app.use rather than Nest's
  // MiddlewareConsumer because nestjs-trpc mounts /trpc straight onto Express,
  // so route-scoped Nest middleware would miss exactly the traffic worth
  // seeing. Adapted from feat/trpc-auth-connect via main.
  app.use(requestLogger);

  /**
   * Serve what was uploaded.
   *
   * Unauthenticated, and the URLs are unguessable rather than protected: the
   * filename is a random UUID. That is a real limitation, not a design goal —
   * §5.8 of the proposal classes return photos as personal data. It is the
   * trade-off that keeps `<img src>` working cross-origin, since a browser
   * sends no cookies with an image request unless the tag opts in. See
   * docs/staff.md before putting this in front of real students.
   */
  app.useStaticAssets(app.get(ImageService).storageRoot, {
    prefix: MEDIA_PREFIX,
    index: false,
    // Uploaded content must never be executed or sniffed into something
    // executable by the browser that displays it.
    setHeaders: (res: ServerResponse) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    },
  });

  app.enableCors({
    origin: ALLOWED_ORIGINS,
    credentials: true,
    // PUT is the file upload. It is not a tRPC verb and never will be.
    methods: ['GET', 'POST', 'PUT', 'OPTIONS'],
  });
}
