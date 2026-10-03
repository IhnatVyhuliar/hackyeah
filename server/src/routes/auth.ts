import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { z } from 'zod';
import { AuthResponseSchema, UserSchema, WalletSchema } from '@unbox/shared';
import { type AuthEnv, checkPassword, requireAuth, signToken } from '../auth';
import { users } from '../db';
import { ApiErr, parse, send } from '../errors';
import { registerUser } from '../seed';
import { walletOf } from '../wallet';

export const authRoutes = new Hono<AuthEnv>();

authRoutes.post('/auth/register', async (c) => {
  const i = parse(z.object({ email: z.email(), password: z.string().min(6), name: z.string().trim().min(1) }), await c.req.json());
  if (users.byEmail(i.email)) throw new ApiErr('VALIDATION', 'Konto z tym adresem już istnieje');
  const user = await registerUser({ id: `u-${randomUUID()}`, email: i.email, name: i.name }, i.password);
  return send(c, AuthResponseSchema, { token: await signToken(user.id), user }, 201);
});

authRoutes.post('/auth/login', async (c) => {
  const i = parse(z.object({ email: z.string(), password: z.string() }), await c.req.json());
  const row = users.byEmail(i.email);
  if (!row || !(await checkPassword(i.password, row.passwordHash))) throw new ApiErr('UNAUTHORIZED', 'Zły e-mail albo hasło');
  return send(c, AuthResponseSchema, { token: await signToken(row.user.id), user: row.user });
});

authRoutes.get('/me', requireAuth, (c) => send(c, UserSchema, c.get('user')));

/** Saldo demo i historia (zabezpieczenia, wypłaty, zwroty). */
authRoutes.get('/me/wallet', requireAuth, (c) => send(c, WalletSchema, walletOf(c.get('user').id)));
