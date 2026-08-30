import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { requestLogger } from './common/request-logger';
import { AppModule } from './app.module';

/**
 * Allowed origins for CORS.
 *
 * Never pair '*' with credentials:true - browsers refuse to send cookies to
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

  // Required, otherwise req.cookies is undefined and context can't find a session
  app.use(cookieParser());

  // One line per request. Registered with app.use rather than Nest's
  // MiddlewareConsumer because nestjs-trpc mounts /trpc straight onto Express,
  // so route-scoped Nest middleware would miss exactly the traffic worth
  // seeing. Adapted from feat/trpc-auth-connect.
  app.use(requestLogger);

  app.enableCors({
    origin: ALLOWED_ORIGINS,
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
  });

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
