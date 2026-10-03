import { Hono } from 'hono';
import { VerificationSchema } from '@sellsol/shared';
import { type AuthEnv, requireAuth } from '../auth';
import { docs } from '../db';
import { ApiErr, send } from '../errors';
import { getOrder, roleIn } from '../orders';

export const verificationRoutes = new Hono<AuthEnv>();

verificationRoutes.get('/verifications/:id', requireAuth, (c) => {
  const v = docs.get('verification', c.req.param('id'));
  if (!v) throw new ApiErr('NOT_FOUND', 'Nie ma takiej weryfikacji');
  roleIn(getOrder(v.orderId), c.get('user').id);
  return send(c, VerificationSchema, v);
});
