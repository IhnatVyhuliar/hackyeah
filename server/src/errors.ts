import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { z } from 'zod';
import { type ErrorCode, FakeChainError } from '@sellsol/shared';
import { config } from './config';

const STATUS: Record<ErrorCode, ContentfulStatusCode> = {
  UNAUTHORIZED: 401, FORBIDDEN: 403, NOT_FOUND: 404, VALIDATION: 400, INVALID_STATE: 409,
  RECORDING_INVALID: 409, TX_NOT_CONFIRMED: 409, CHAIN_ERROR: 502, AI_ERROR: 502,
};

export class ApiErr extends Error {
  constructor(public code: ErrorCode, message: string, public status: ContentfulStatusCode = STATUS[code]) {
    super(message);
  }
}

export function errorResponse(err: unknown, c: Context) {
  if (err instanceof ApiErr) return c.json({ error: { code: err.code, message: err.message } }, err.status);
  if (err instanceof FakeChainError)   // tryb mock: błąd "programu" → jak odrzucona transakcja
    return c.json({ error: { code: 'CHAIN_ERROR', message: `Program odrzucił instrukcję: ${err.code}` } }, 409);
  console.error(err);
  return c.json({ error: { code: 'CHAIN_ERROR', message: err instanceof Error ? err.message : String(err) } }, 500);
}

/** Parsuje body; błąd → 400 VALIDATION. */
export function parse<S extends z.ZodType>(schema: S, value: unknown): z.infer<S> {
  const r = schema.safeParse(value);
  if (!r.success) throw new ApiErr('VALIDATION', r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  return r.data;
}

/** Odpowiedź walidowana zod w dev (KONTRAKT §8). */
export function send<S extends z.ZodType>(c: Context, schema: S, value: z.infer<S>, status: ContentfulStatusCode = 200) {
  if (config.validateResponses) {
    const r = schema.safeParse(value);
    if (!r.success) {
      console.error('[contract] odpowiedź niezgodna ze schematem', c.req.path, r.error.issues);
      throw new ApiErr('VALIDATION', `Serwer zwrócił dane niezgodne z kontraktem: ${r.error.issues[0]?.path.join('.')}`, 500);
    }
  }
  return c.json(value as object, status);
}
