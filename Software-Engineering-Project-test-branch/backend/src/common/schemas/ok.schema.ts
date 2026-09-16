import { z } from 'zod';

/**
 * Response for a mutation whose only interesting outcome is "it worked".
 *
 * A literal `true` rather than a boolean: there is no such thing as
 * `{ ok: false }` here, because failure travels as a tRPC error (ว-06). If a
 * procedure ever wants to return `false`, it wants an error code instead.
 */
export const okOutput = z.object({ ok: z.literal(true) });

/** The value every such procedure returns. */
export const OK = { ok: true } as const;
