import type { TRPCDefaultErrorShape } from '@trpc/server';
import { BusinessError } from '../common/errors/business-error';

/**
 * Puts BusinessError context on the wire.
 *
 * business-error.ts promises that extra detail rides in `cause` "so the
 * frontend can fill in the blanks". tRPC's default error shape does not
 * serialise `cause`, so without this formatter that promise is silently
 * broken: the client sees only a code and has nothing to interpolate into a
 * message like "ยืมได้สูงสุด {maxDays} วัน".
 *
 * Only BusinessError detail is exposed. An unexpected error's cause can hold
 * anything - a driver error with a connection string, a stack from a
 * dependency - so it is never copied out.
 */
export function formatTrpcError({
  shape,
  error,
}: {
  shape: TRPCDefaultErrorShape;
  error: Error;
}): TRPCDefaultErrorShape {
  const isProduction = process.env.NODE_ENV === 'production';

  const data: TRPCDefaultErrorShape['data'] & {
    businessCode?: string;
    details?: Record<string, unknown>;
  } = { ...shape.data };

  // A stack trace names internal paths and dependency versions. Useful on a
  // laptop, free reconnaissance in production.
  if (isProduction) delete (data as { stack?: string }).stack;

  // Read `details`, never `cause`: TRPCError wraps a non-Error cause in an
  // internal UnknownCauseError, so `cause` is not the object the error was
  // built with. See the note on BusinessError.details.
  if (error instanceof BusinessError) {
    data.businessCode = error.businessCode;
    if (error.details !== null) data.details = error.details;
  }

  return { ...shape, data };
}
