import { Hono } from 'hono';
import { z } from 'zod';
import {
  AcceptBodySchema, type Complaint, ConfirmReturnBodySchema, DealSchema, DisputeBodySchema, hashDocument, ReturnBodySchema,
  RoleSchema, ShipBodySchema,
} from '@unbox/shared';
import { MOCK_SCENARIOS } from '../ai/types';
import { type AuthEnv, requireAuth } from '../auth';
import { now } from '../clock';
import { config } from '../config';
import { media } from '../db';
import { applyAction, dealsOf, expireIfDue, getDeal, requireParticipant } from '../deals';
import { startAnalysis } from '../disputes';
import { ApiErr, parse, send } from '../errors';

export const dealRoutes = new Hono<AuthEnv>();
dealRoutes.use('/deals', requireAuth);
dealRoutes.use('/deals/*', requireAuth);

/** Nagranie musi być wgrane wcześniej (POST /api/media) przez tę samą osobę. */
function requireVideo(sha256: string, userId: string, what: string) {
  const m = media.get(sha256);
  if (!m || m.uploaderId !== userId || !m.mimeType.startsWith('video/'))
    throw new ApiErr('VALIDATION', `${what}: najpierw wgraj nagranie (POST /api/media)`);
}

const participantDeal = (id: string, userId: string, role?: 'buyer' | 'seller') => {
  const d = expireIfDue(id);
  const r = requireParticipant(d, userId);
  // Najpierw uprawnienia, potem walidacja wskazanych plików (obcy dostaje 403, nie 400).
  if (role && r !== role) throw new ApiErr('FORBIDDEN', role === 'buyer' ? 'Tę akcję wykonuje kupujący' : 'Tę akcję wykonuje sprzedający');
  return d;
};

dealRoutes.get('/deals', (c) => {
  const role = parse(RoleSchema, c.req.query('role'));
  return send(c, z.array(DealSchema), dealsOf(c.get('user').id, role));
});

dealRoutes.get('/deals/:id', (c) => send(c, DealSchema, participantDeal(c.req.param('id'), c.get('user').id)));

dealRoutes.post('/deals/:id/ship', async (c) => {
  const user = c.get('user');
  const i = parse(ShipBodySchema, await c.req.json());
  participantDeal(c.req.param('id'), user.id, 'seller');
  requireVideo(i.packingVideoSha256, user.id, 'Nagranie pakowania');
  return send(c, DealSchema, applyAction(c.req.param('id'), { type: 'ship', actorId: user.id, ...i }));
});

dealRoutes.post('/deals/:id/accept', async (c) => {
  const user = c.get('user');
  const i = parse(AcceptBodySchema, await c.req.json());
  participantDeal(c.req.param('id'), user.id);
  return send(c, DealSchema, applyAction(c.req.param('id'), { type: 'accept', actorId: user.id, ...i }));
});

dealRoutes.post('/deals/:id/dispute', async (c) => {
  const user = c.get('user');
  const i = parse(DisputeBodySchema, await c.req.json());
  const header = c.req.header('X-Demo-Scenario');
  const scenario = config.ai === 'mock' && header ? parse(z.enum(MOCK_SCENARIOS), header) : undefined;
  participantDeal(c.req.param('id'), user.id, 'buyer');
  requireVideo(i.unboxingVideoSha256, user.id, 'Nagranie otwarcia');
  const complaint: Complaint = { v: 1, category: i.complaint.category, description: i.complaint.description, created_at: now() };
  const deal = applyAction(c.req.param('id'), {
    type: 'dispute', actorId: user.id, qrSecret: i.qrSecret, unboxingVideoSha256: i.unboxingVideoSha256,
    complaint, complaintHash: hashDocument(complaint),
  });
  startAnalysis(deal.id, scenario);
  return send(c, DealSchema, getDeal(deal.id));
});

dealRoutes.post('/deals/:id/return', async (c) => {
  const user = c.get('user');
  const i = parse(ReturnBodySchema, await c.req.json());
  participantDeal(c.req.param('id'), user.id, 'buyer');
  requireVideo(i.returnVideoSha256, user.id, 'Nagranie pakowania zwrotu');
  return send(c, DealSchema, applyAction(c.req.param('id'), { type: 'return', actorId: user.id, ...i }));
});

dealRoutes.post('/deals/:id/confirm-return', async (c) => {
  const user = c.get('user');
  const i = parse(ConfirmReturnBodySchema, await c.req.json());
  participantDeal(c.req.param('id'), user.id);
  return send(c, DealSchema, applyAction(c.req.param('id'), { type: 'confirm_return', actorId: user.id, ...i }));
});

/** „Odbierz środki” po terminie. Backend domyka też sam (odczyt i cykliczny sweep); to wymusza od razu. */
dealRoutes.post('/deals/:id/settle', (c) => {
  const user = c.get('user');
  const d = getDeal(c.req.param('id'));
  requireParticipant(d, user.id);
  return send(c, DealSchema, applyAction(d.id, { type: 'expire' }));
});
