import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { requestLogger } from './common/request-logger';

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
  const app = await NestFactory.create(AppModule);

  // First, so it times the whole request including everything below.
  app.use(requestLogger);

  // Required, otherwise req.cookies is undefined and context can't find a session
  app.use(cookieParser());

  app.enableCors({
    origin: ALLOWED_ORIGINS,
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port);

  // Nest's own startup line doesn't say where it's listening — this does.
  Logger.log(`Listening on http://localhost:${port} (tRPC at /trpc)`, 'Bootstrap');
}
bootstrap();
