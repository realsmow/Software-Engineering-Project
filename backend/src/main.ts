import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { ServerResponse } from 'node:http';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
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
const ALLOWED_ORIGINS = [
  'http://localhost:5173', // Vite dev server
  'http://localhost:4173', // vite preview
  // TODO: add the production frontend origin once it's known
];

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Required, otherwise req.cookies is undefined and context can't find a session
  app.use(cookieParser());

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

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
