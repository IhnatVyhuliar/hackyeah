import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { z } from 'zod';
import { AuthResponseSchema, Base58Schema, nowUnix, type User, UserSchema } from '@sellsol/shared';
import { type AuthEnv, checkPassword, hashPassword, requireAuth, signToken } from '../auth';
import { users } from '../db';
import { ApiErr, parse, send } from '../errors';
import { dripIfNeeded } from '../treasury';

export const authRoutes = new Hono<AuthEnv>();

authRoutes.post('/auth/register', async (c) => {
  const i = parse(z.object({ email: z.email(), password: z.string().min(6), name: z.string().min(1) }), await c.req.json());
  if (users.byEmail(i.email)) throw new ApiErr('VALIDATION', 'Konto z tym adresem już istnieje');
  const user: User = { id: `u-${randomUUID()}`, email: i.email.toLowerCase(), name: i.name, walletAddress: null, createdAt: nowUnix() };
  users.insert(user, await hashPassword(i.password));
  return send(c, AuthResponseSchema, { token: await signToken(user.id), user }, 201);
});

authRoutes.post('/auth/login', async (c) => {
  const i = parse(z.object({ email: z.string(), password: z.string() }), await c.req.json());
  const row = users.byEmail(i.email);
  if (!row || !(await checkPassword(i.password, row.passwordHash))) throw new ApiErr('UNAUTHORIZED', 'Zły e-mail albo hasło');
  return send(c, AuthResponseSchema, { token: await signToken(row.user.id), user: row.user });
});

authRoutes.get('/me', requireAuth, (c) => send(c, UserSchema, c.get('user')));

authRoutes.patch('/me', requireAuth, async (c) => {
  const i = parse(z.object({ walletAddress: Base58Schema }), await c.req.json());
  const user = { ...c.get('user'), walletAddress: i.walletAddress };
  users.update(user);
  // Zasilenie na opłaty sieci (devnet). Błąd skarbca nie blokuje logowania.
  await dripIfNeeded(i.walletAddress).catch((e) => console.warn('[treasury]', (e as Error).message));
  return send(c, UserSchema, user);
});
