import bcrypt from 'bcryptjs';
import { createMiddleware } from 'hono/factory';
import { jwtVerify, SignJWT } from 'jose';
import type { User } from '@unbox/shared';
import { config } from './config';
import { users } from './db';
import { ApiErr } from './errors';

const key = new TextEncoder().encode(config.jwtSecret);

export const hashPassword = (p: string) => bcrypt.hash(p, 10);
export const checkPassword = (p: string, hash: string) => bcrypt.compare(p, hash);

export const signToken = (userId: string) =>
  new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).setSubject(userId).setIssuedAt().setExpirationTime('7d').sign(key);

export type AuthEnv = { Variables: { user: User } };

export const requireAuth = createMiddleware<AuthEnv>(async (c, next) => {
  const h = c.req.header('Authorization');
  if (!h?.startsWith('Bearer ')) throw new ApiErr('UNAUTHORIZED', 'Brak tokenu');
  try {
    const { payload } = await jwtVerify(h.slice(7), key);
    const user = payload.sub ? users.byId(payload.sub) : null;
    if (!user) throw new Error('no user');
    c.set('user', user);
  } catch {
    throw new ApiErr('UNAUTHORIZED', 'Nieprawidłowy albo wygasły token');
  }
  await next();
});
