import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { z } from 'zod';
import { DealError, type ErrorCode } from '@unbox/shared';
import { config } from './config';

const STATUS: Record<ErrorCode, ContentfulStatusCode> = {
  UNAUTHORIZED: 401, FORBIDDEN: 403, NOT_FOUND: 404, VALIDATION: 400, INVALID_STATE: 409,
  DEADLINE_PASSED: 409, DEADLINE_NOT_REACHED: 409, QR_MISMATCH: 409, INSUFFICIENT_FUNDS: 409,
  AI_ERROR: 502, INTERNAL: 500,
};

export class ApiErr extends Error {
  constructor(public code: ErrorCode, message: string, public status: ContentfulStatusCode = STATUS[code]) {
    super(message);
  }
}

export function errorResponse(err: unknown, c: Context) {
  if (err instanceof ApiErr) return c.json({ error: { code: err.code, message: err.message } }, err.status);
  if (err instanceof DealError) return c.json({ error: { code: err.code, message: err.message } }, STATUS[err.code]);
  if (err instanceof SyntaxError) return c.json({ error: { code: 'VALIDATION', message: 'Niepoprawny JSON' } }, 400);
  console.error(err);
  return c.json({ error: { code: 'INTERNAL', message: err instanceof Error ? err.message : String(err) } }, 500);
}

/** Parsuje dane wejściowe; błąd → 400 VALIDATION. */
export function parse<S extends z.ZodType>(schema: S, value: unknown): z.infer<S> {
  const r = schema.safeParse(value);
  if (!r.success) throw new ApiErr('VALIDATION', r.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '));
  return r.data;
}

/** Odpowiedź walidowana zod poza produkcją (wykrywa rozjazd z typami w shared). */
export function send<S extends z.ZodType>(c: Context, schema: S, value: z.infer<S>, status: ContentfulStatusCode = 200) {
  if (config.validateResponses) {
    const r = schema.safeParse(value);
    if (!r.success) {
      console.error('[contract] odpowiedź niezgodna ze schematem', c.req.path, r.error.issues);
      throw new ApiErr('INTERNAL', `Odpowiedź niezgodna ze schematem: ${r.error.issues[0]?.path.join('.')}`);
    }
  }
  return c.json(value as object, status);
}
