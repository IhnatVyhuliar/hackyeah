import { randomBytes, randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { z } from 'zod';
import {
  escrowPda, LockerEventTypeSchema, nowUnix, type Order, OrderSchema, PreparedTxSchema, RoleSchema, type Seal,
  SealSchema, sealHash, sealPayload, shortCode, termsHash, timeoutOutcome, type TxAction, TxActionSchema,
} from '@sellsol/shared';
import { type AuthEnv, requireAuth } from '../auth';
import { config } from '../config';
import { docs, seals } from '../db';
import { ApiErr, parse, send } from '../errors';
import { runOracle } from '../oracle';
import {
  addTimeline, addTx, applyEscrow, chain, getOrder, readEscrow, rememberEscrow, roleIn, saveOrder, syncOrder, viewOrder,
} from '../orders';
import { loadSealPool } from '../seed';

export const orderRoutes = new Hono<AuthEnv>();
orderRoutes.use('/orders', requireAuth);
orderRoutes.use('/orders/*', requireAuth);

const sealPool = loadSealPool();

function nextDemoOrderId(): string {
  const free = sealPool.find((p) => !seals.isUsed(p.orderId) && !docs.get('order', p.orderId));
  if (!free) throw new ApiErr('INVALID_STATE', 'Pula plomb demo wyczerpana (dodaj plomby do seal-pool.json)');
  return free.orderId;
}

orderRoutes.post('/orders', async (c) => {
  const user = c.get('user');
  const { listingId } = parse(z.object({ listingId: z.string() }), await c.req.json());
  const listing = docs.get('listing', listingId);
  if (!listing) throw new ApiErr('NOT_FOUND', 'Nie ma takiej oferty');
  if (listing.sellerId === user.id) throw new ApiErr('FORBIDDEN', 'Nie możesz kupić własnej oferty');
  if (listing.status !== 'active') throw new ApiErr('INVALID_STATE', 'Oferta nie jest już dostępna');
  if (!user.walletAddress) throw new ApiErr('INVALID_STATE', 'Najpierw podłącz portfel (PATCH /api/me)');
  const sellerWallet = listing.seller.walletAddress;
  if (!sellerWallet) throw new ApiErr('INVALID_STATE', 'Sprzedający nie ma jeszcze portfela');
  if (sellerWallet === user.walletAddress) throw new ApiErr('INVALID_STATE', 'Kupujący i sprzedający mają ten sam portfel');

  const id = config.demoMode ? nextDemoOrderId() : randomUUID();
  const now = nowUnix();
  const order: Order = {
    id, listing: { ...listing, status: 'reserved' }, buyerId: user.id, sellerId: listing.sellerId,
    buyerWallet: user.walletAddress, sellerWallet, amountLamports: listing.priceLamports,
    escrowPda: escrowPda(id, config.programId), programId: config.programId, cluster: chain.cluster,
    status: 'awaiting_payment', chainStatus: 'none',
    termsHash: termsHash({
      listingId: listing.id, priceLamports: listing.priceLamports, sellerWallet,
      thresholds: listing.thresholds, windows: listing.windows,
      extraTests: listing.extraTests.map((t) => t.description), declaredWeightG: listing.declaredWeightG,
    }),
    thresholds: listing.thresholds, windows: listing.windows,
    shipDeadline: null, openDeadline: null, verdictDeadline: null, seal: null,
    packingVideoHash: null, unboxingVideoHash: null, packingVerificationId: null, unboxingVerificationId: null,
    lockerEvents: [], measurements: null, outcomeReason: null, txs: [],
    timeline: [{ at: now, type: 'created', label: 'Zamówienie utworzone, czeka na wpłatę do escrow' }],
    createdAt: now,
  };
  docs.put('listing', listing.id, { ...listing, status: 'reserved' });
  saveOrder(order);
  return send(c, OrderSchema, viewOrder(order, user.id), 201);
});

orderRoutes.get('/orders', async (c) => {
  const user = c.get('user');
  const role = parse(RoleSchema, c.req.query('role'));
  const mine = docs.list('order').filter((o) => (role === 'buyer' ? o.buyerId : o.sellerId) === user.id)
    .sort((a, b) => b.createdAt - a.createdAt);
  const synced = await Promise.all(mine.map((o) => syncOrder(o)));
  return send(c, z.array(OrderSchema), synced.map((o) => viewOrder(o, user.id)));
});

orderRoutes.get('/orders/:id', async (c) => {
  const user = c.get('user');
  const o = getOrder(c.req.param('id'));
  roleIn(o, user.id);
  return send(c, OrderSchema, viewOrder(await syncOrder(o), user.id));
});

// ---------- transakcje ----------

const WHO: Record<Exclude<TxAction, 'submit_verdict'>, 'buyer' | 'seller' | 'any'> = {
  fund: 'buyer', seller_decline: 'seller', commit_shipment: 'seller', confirm_receipt: 'buyer',
  open_claim: 'buyer', claim_timeout: 'any',
};

function checkActor(o: Order, userId: string, wallet: string | null, action: TxAction) {
  if (action === 'submit_verdict') throw new ApiErr('FORBIDDEN', 'submit_verdict wysyła tylko serwer (wyrocznia)');
  const role = roleIn(o, userId);
  const who = WHO[action];
  if (who !== 'any' && who !== role) throw new ApiErr('FORBIDDEN', `Akcję ${action} wykonuje ${who === 'buyer' ? 'kupujący' : 'sprzedający'}`);
  if (!wallet) throw new ApiErr('INVALID_STATE', 'Najpierw podłącz portfel');
  const expected = role === 'buyer' ? o.buyerWallet : o.sellerWallet;
  if (who !== 'any' && wallet !== expected) throw new ApiErr('FORBIDDEN', 'Portfel nie zgadza się z portfelem zamówienia');
}

/** Ostatnia weryfikacja otwarcia musi być "done" i ważna (oszczędza bezużyteczną transakcję; program i tak przyjmie hasz). */
function validUnboxingHash(o: Order): string {
  const v = o.unboxingVerificationId ? docs.get('verification', o.unboxingVerificationId) : null;
  if (!v || v.status !== 'done' || !v.report?.recordingValid)
    throw new ApiErr('RECORDING_INVALID', v?.status === 'processing' ? 'AI jeszcze sprawdza nagranie' : 'Nagranie otwarcia jest nieważne: nagraj ponownie');
  return v.report.videoSha256;
}

orderRoutes.post('/orders/:id/tx/prepare', async (c) => {
  const user = c.get('user');
  const { action } = parse(z.object({ action: TxActionSchema }), await c.req.json());
  const o = getOrder(c.req.param('id'));
  checkActor(o, user.id, user.walletAddress, action);
  // Wstępne warunki (§8) na świeżym odczycie konta; ostatecznie egzekwuje je program.
  const e = await readEscrow(o.id, true);
  const st = e?.status ?? 'none';
  const need = (ok: boolean, msg: string) => { if (!ok) throw new ApiErr('INVALID_STATE', msg); };
  let extra: { unboxingVideoHash?: string } | undefined;
  switch (action) {
    case 'fund': need(st === 'none', 'Escrow dla tego zamówienia już istnieje'); break;
    case 'seller_decline': need(st === 'Funded', 'Zamówienie nie jest w stanie Funded'); break;
    case 'commit_shipment':
      need(st === 'Funded', 'Zamówienie nie jest w stanie Funded');
      need(!!o.seal && !!o.packingVideoHash, 'Najpierw wygeneruj plombę i nagraj pakowanie');
      break;
    case 'confirm_receipt': need(st === 'Shipped' || st === 'Verifying', 'Paczka nie została jeszcze nadana'); break;
    case 'open_claim':
      need(st === 'Shipped', 'Zamówienie nie jest w stanie Shipped');
      extra = { unboxingVideoHash: validUnboxingHash(o) };
      break;
    case 'claim_timeout':
      need(!!e && !!timeoutOutcome(e, await chain.now()), 'Żaden termin jeszcze nie minął (według stanu on-chain)');
      break;
  }
  const prepared = await chain.prepare(o, action, user.walletAddress!, extra);
  return send(c, PreparedTxSchema, prepared);
});

orderRoutes.post('/orders/:id/tx', async (c) => {
  const user = c.get('user');
  const { action, signature } = parse(z.object({ action: TxActionSchema, signature: z.string().min(1) }), await c.req.json());
  const o = getOrder(c.req.param('id'));
  checkActor(o, user.id, user.walletAddress, action);
  // Nie ufamy klientowi: adapter czeka na potwierdzenie i ponownie czyta konto escrow.
  const state = await chain.confirmAndRead(o, action, signature);
  if (!state) throw new ApiErr('TX_NOT_CONFIRMED', 'Konto escrow nie istnieje po transakcji');
  rememberEscrow(o.id, state);
  addTx(o, action, signature);
  if (action === 'fund') seals.markUsed(o.id);
  applyEscrow(o, state);
  saveOrder(o);
  if (state.status === 'Verifying') void runOracle(o.id);
  return send(c, OrderSchema, viewOrder(o, user.id));
});

// ---------- plomba i paczkomat ----------

orderRoutes.post('/orders/:id/seal', async (c) => {
  const user = c.get('user');
  const o = await syncOrder(getOrder(c.req.param('id')));
  if (roleIn(o, user.id) !== 'seller') throw new ApiErr('FORBIDDEN', 'Plombę generuje sprzedający');
  if (o.seal) return send(c, SealSchema, o.seal);   // idempotentne
  if (o.chainStatus !== 'Funded') throw new ApiErr('INVALID_STATE', 'Plomba dopiero po wpłacie do escrow');
  const fromPool = sealPool.find((p) => p.orderId === o.id);
  let seal: Seal;
  if (fromPool) seal = fromPool.seal;
  else {
    const nonce = randomBytes(16).toString('hex');
    const qrPayload = sealPayload(o.id, nonce);
    seal = { qrPayload, sealHash: sealHash(qrPayload), shortCode: shortCode(nonce) };
  }
  o.seal = seal;
  addTimeline(o, 'seal_created', `Wygenerowano plombę ${seal.shortCode}`);
  saveOrder(o);
  return send(c, SealSchema, seal, 201);
});

orderRoutes.post('/orders/:id/locker-event', async (c) => {
  const user = c.get('user');
  const i = parse(z.object({ type: LockerEventTypeSchema, lockerId: z.string().min(1), weightG: z.int().min(0).max(100_000) }),
    await c.req.json());
  const o = getOrder(c.req.param('id'));
  roleIn(o, user.id);
  o.lockerEvents.push({ ...i, at: nowUnix() });
  addTimeline(o, `locker_${i.type}`, i.type === 'dropped_off'
    ? `Paczkomat ${i.lockerId}: paczka nadana (${i.weightG} g)`
    : `Paczkomat ${i.lockerId}: paczka gotowa do odbioru (${i.weightG} g)`);
  return send(c, OrderSchema, viewOrder(await syncOrder(o), user.id));
});
