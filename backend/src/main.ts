import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { requestLogger } from './common/request-logger';
import { AppModule } from './app.module';

/** Local dev servers, always allowed. */
const DEV_ORIGINS = [
  'http://localhost:5173', // Vite dev server
  'http://localhost:4173', // vite preview
];

/**
 * Allowed origins for CORS.
 *
 * Never pair '*' with credentials:true - browsers refuse to send cookies to a
 * wildcard origin anyway, and this app uses a cookie as its auth token, so a
 * wide-open origin would let any site fire requests as a logged-in user (CSRF).
 *
 * The production origin comes from CORS_ORIGINS (comma-separated) rather than
 * being hardcoded. Deployed without it, the real frontend is blocked by CORS on
 * every request - which looks like the backend being down rather than a config
 * gap, so production refuses to boot instead of failing that way at runtime.
 */
function resolveAllowedOrigins(): string[] {
  const configured = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  if (process.env.NODE_ENV === 'production') {
    if (configured.length === 0) {
      throw new Error(
        'CORS_ORIGINS must list the production frontend origin(s) when NODE_ENV=production, ' +
          'e.g. CORS_ORIGINS=https://ulms.example.ac.th',
      );
    }
    // Localhost is not an allowed origin for a deployed server.
    return configured;
  }

  return [...DEV_ORIGINS, ...configured];
}

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
    origin: resolveAllowedOrigins(),
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
  });

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
