import { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

const logger = new Logger('HTTP');

/**
 * One line per request: method, path, status, duration.
 *
 * Registered with `app.use()` in main.ts rather than through Nest's
 * MiddlewareConsumer, because tRPC is mounted straight onto the Express app
 * by nestjs-trpc's driver - route-scoped Nest middleware would miss /trpc,
 * which is the traffic we most want to see.
 *
 * Note that a tRPC call that fails inside a procedure can still finish with
 * HTTP 200 (batched responses carry per-call errors in the body), so this is
 * a companion to TrpcErrorLogger, not a replacement for it.
 */
/**
 * The path without its query, with upload tickets masked.
 *
 * tRPC GET calls carry their input in the query (search terms, student IDs),
 * the Google callback carries an auth code, and an upload path is itself a
 * signed ticket. None of that belongs in a log.
 */
export function loggablePath(url: string): string {
  return url.split('?')[0].replace(/^\/uploads\/[^/]+/, '/uploads/:token');
}

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const startedAt = Date.now();

  // 'finish' fires once the response is fully sent, so the status and
  // duration are final by then.
  res.once('finish', () => {
    const line = `${req.method} ${loggablePath(req.originalUrl)} ${res.statusCode} ${Date.now() - startedAt}ms`;

    if (res.statusCode >= 500) logger.error(line);
    else if (res.statusCode >= 400) logger.warn(line);
    else logger.log(line);
  });

  next();
}
