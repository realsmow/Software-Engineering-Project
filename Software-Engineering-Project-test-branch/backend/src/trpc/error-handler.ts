import { Injectable, Logger } from '@nestjs/common';
import type { OnErrorOptions, TRPCErrorHandler } from 'nestjs-trpc';
import type { TrpcUser } from './context';

/**
 * Logs every error thrown by a tRPC procedure.
 *
 * Without this, nothing reaches the server console at all: tRPC catches the
 * error, serialises it for the client, and moves on. A genuine crash inside a
 * procedure would be invisible on the backend and show up only as a generic
 * INTERNAL_SERVER_ERROR in the browser.
 *
 * Wired up via `onError` in TRPCModule.forRoot() - the option is opt-in, so
 * removing it there silently restores the blind spot.
 */
@Injectable()
export class TrpcErrorLogger implements TRPCErrorHandler {
  private readonly logger = new Logger('tRPC');

  onError({ error, type, path, ctx }: OnErrorOptions): void {
    // ctx is a bare record here; `user` is what AppContext.create() put on it.
    const user = ctx?.user as TrpcUser | null | undefined;
    const who = user ? `account:${user.accountKey}` : 'anonymous';
    const label = `${type} ${path ?? '<unknown path>'} (${who}) -> ${error.code}`;

    /**
     * INTERNAL_SERVER_ERROR means a bug - an exception that wasn't a
     * deliberate TRPCError. Those are the ones worth a full stack trace.
     * tRPC wraps the original throw in `cause`, which is where the useful
     * message lives (e.g. a Prisma failure, or an unseeded CreditTier).
     */
    if (error.code === 'INTERNAL_SERVER_ERROR') {
      const cause = error.cause instanceof Error ? error.cause : error;
      this.logger.error(`${label} - ${cause.message}`, cause.stack);
      return;
    }

    /**
     * Everything else is the API working as designed: a rejected login, a
     * role check, a failed input validation. Worth one line for debugging,
     * never a stack trace - otherwise a few wrong passwords bury the log.
     */
    this.logger.warn(`${label} - ${error.message}`);
  }
}
